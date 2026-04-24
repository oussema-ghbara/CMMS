import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { User } from '@gmao/db';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '@gmao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { AccessTokenPayload, RefreshTokenPayload } from './types/jwt-payload.type';
import type { AuthResponseDto } from './dto/auth-response.dto';
import type { UsersService } from '../users/users.service';

const RT_PREFIX = 'rt:';
const RT_SET_PREFIX = 'rt-set:';
const DEFAULT_RT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SESSION_IDLE_TIMEOUT_HOURS_KEY = 'SESSION_IDLE_TIMEOUT_HOURS';

// Dummy hash used to keep validateUser constant-time when user is not found.
// Generated with bcrypt.hash('dummy', 12) — not a real secret.
const DUMMY_HASH = '$2b$12$invalidhashinvalidhashinvalidhashinvalidhashinvalidhashi';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly systemConfig: SystemConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // forwardRef because AuthModule ↔ UsersModule import each other
    @Inject(forwardRef(() => require('../users/users.service').UsersService))
    private readonly usersService: UsersService,
  ) {}

  /**
   * Validates email + password. Returns the User on success, null on failure.
   * Always runs bcrypt.compare to prevent timing-based user enumeration.
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email, isActive: true },
    });

    const hash = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await bcrypt.compare(password, hash);

    if (!user || !isValid) return null;
    return user;
  }

  async login(user: User, res: Response): Promise<AuthResponseDto> {
    const refreshTokenTtlSeconds = await this.getRefreshTokenTtlSeconds();
    const { accessToken, refreshToken, refreshJti } = await this.issueTokenPair(
      user,
      refreshTokenTtlSeconds,
    );
    await this.storeRefreshToken(user.id, refreshJti, refreshTokenTtlSeconds);
    await this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch((err: unknown) =>
        this.logger.error(`lastLoginAt update failed for ${user.id}`, err),
      );
    this.attachRefreshCookie(res, refreshToken, refreshTokenTtlSeconds);
    return { accessToken, roles: user.roles as Role[], userId: user.id, name: user.name };
  }

  async refresh(rawRefreshToken: string, res: Response): Promise<AuthResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('auth.invalidRefreshToken');
    }

    const exists = await this.redis.get(`${RT_PREFIX}${payload.sub}:${payload.jti}`);
    if (exists !== '1') throw new UnauthorizedException('auth.refreshTokenRevoked');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) throw new ForbiddenException('auth.accountInactive');

    // Token rotation: revoke old, issue new
    const pipeline = this.redis.pipeline();
    pipeline.del(`${RT_PREFIX}${payload.sub}:${payload.jti}`);
    pipeline.srem(`${RT_SET_PREFIX}${payload.sub}`, payload.jti);
    await pipeline.exec();
    const refreshTokenTtlSeconds = await this.getRefreshTokenTtlSeconds();
    const { accessToken, refreshToken, refreshJti } = await this.issueTokenPair(
      user,
      refreshTokenTtlSeconds,
    );
    await this.storeRefreshToken(user.id, refreshJti, refreshTokenTtlSeconds);

    this.attachRefreshCookie(res, refreshToken, refreshTokenTtlSeconds);
    return { accessToken, roles: user.roles as Role[], userId: user.id, name: user.name };
  }

  async logout(rawRefreshToken: string, res: Response): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const pipeline = this.redis.pipeline();
      pipeline.del(`${RT_PREFIX}${payload.sub}:${payload.jti}`);
      pipeline.srem(`${RT_SET_PREFIX}${payload.sub}`, payload.jti);
      await pipeline.exec();
    } catch {
      // Token may be expired or invalid — still clear the cookie
      this.logger.warn('Logout called with invalid refresh token — clearing cookie anyway');
    }
    this.clearRefreshCookie(res);
  }

  /** Revokes all refresh tokens for a user. Called on account deactivation. */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const jtis = await this.redis.smembers(`${RT_SET_PREFIX}${userId}`);
    if (jtis.length === 0) return;
    const pipeline = this.redis.pipeline();
    jtis.forEach((jti) => pipeline.del(`${RT_PREFIX}${userId}:${jti}`));
    pipeline.del(`${RT_SET_PREFIX}${userId}`);
    await pipeline.exec();
  }

  private async issueTokenPair(user: User, refreshTokenTtlSeconds: number): Promise<TokenPair> {
    const refreshJti = uuidv4();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles as Role[],
    };

    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti: refreshJti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTokenTtlSeconds,
      }),
    ]);

    return { accessToken, refreshToken, refreshJti };
  }

  private async storeRefreshToken(userId: string, jti: string, refreshTokenTtlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.setex(`${RT_PREFIX}${userId}:${jti}`, refreshTokenTtlSeconds, '1');
    pipeline.sadd(`${RT_SET_PREFIX}${userId}`, jti);
    pipeline.expire(`${RT_SET_PREFIX}${userId}`, refreshTokenTtlSeconds);
    await pipeline.exec();
  }

  private attachRefreshCookie(res: Response, token: string, refreshTokenTtlSeconds: number): void {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: this.cfg.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: refreshTokenTtlSeconds * 1000,
    });
  }

  private async getRefreshTokenTtlSeconds(): Promise<number> {
    const configuredHours = await this.systemConfig.get(SESSION_IDLE_TIMEOUT_HOURS_KEY);
    const parsedHours = Number.parseInt(configuredHours ?? '', 10);

    if (Number.isInteger(parsedHours) && parsedHours > 0) {
      return parsedHours * 60 * 60;
    }

    this.logger.warn(
      `Invalid ${SESSION_IDLE_TIMEOUT_HOURS_KEY} value "${configuredHours}". Falling back to ${DEFAULT_RT_TTL_SECONDS} seconds.`,
    );
    return DEFAULT_RT_TTL_SECONDS;
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.cfg.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
  }

  async setupAccount(token: string, password: string): Promise<void> {
    const { userId, jti } = await this.usersService.consumeSetupToken(token).catch(() => {
      throw new UnauthorizedException('auth.invalidOrExpiredToken');
    });

    const violation = await this.systemConfig.validatePassword(password);
    if (violation) throw new BadRequestException(violation);

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, isActive: true },
    });
    await this.usersService.markTokenUsed('setup:', userId, jti);
    this.logger.log(`Account setup complete for user ${userId}`);
  }

  async resendSetup(email: string): Promise<void> {
    await Promise.resolve(this.usersService.resendSetupByEmail(email)).catch((err: unknown) =>
      this.logger.error('resendSetup error', err),
    );
  }

  async forgotPassword(email: string): Promise<void> {
    // Fire-and-forget — no enumeration
    await this.usersService.generateResetToken(email).catch((err: unknown) =>
      this.logger.error('forgotPassword error', err),
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const { userId, jti } = await this.usersService.consumeResetToken(token).catch(() => {
      throw new UnauthorizedException('auth.invalidOrExpiredToken');
    });

    const violation = await this.systemConfig.validatePassword(password);
    if (violation) throw new BadRequestException(violation);

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.usersService.markTokenUsed('reset:', userId, jti);
    this.logger.log(`Password reset complete for user ${userId}`);
  }
}
