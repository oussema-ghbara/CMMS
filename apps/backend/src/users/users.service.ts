import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '@gmao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponseDto } from './dto/user-response.dto';

const SETUP_TOKEN_PREFIX = 'setup:';
const SETUP_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const RESET_TOKEN_PREFIX = 'reset:';
const RESET_TOKEN_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly mail: MailService,
    private readonly authService: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async findAll(filters: {
    role?: Role;
    isActive?: boolean;
  }): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        ...(filters.role ? { roles: { has: filters.role } } : {}),
        ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return users as UserResponseDto[];
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('users.notFound');
    return user as UserResponseDto;
  }

  async create(dto: CreateUserDto, actorId: string): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('users.emailAlreadyExists');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        roles: dto.roles,
        hourlyRate: dto.hourlyRate ?? null,
        // No passwordHash yet — user sets it via setup link
        passwordHash: '',
        isActive: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await this.sendSetupEmail(user.id, user.email, user.name, actorId);

    this.logger.log(`User created: ${user.email} by actor ${actorId}`);
    return user as UserResponseDto;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<UserResponseDto> {
    await this.findOne(id); // throws NotFoundException if missing

    if (dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (conflict) throw new ConflictException('users.emailAlreadyExists');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.roles ? { roles: dto.roles } : {}),
        ...(dto.hourlyRate !== undefined ? { hourlyRate: dto.hourlyRate } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    this.logger.log(`User updated: ${id} by actor ${actorId}`);
    return user as UserResponseDto;
  }

  async deactivate(id: string, actorId: string): Promise<void> {
    const user = await this.findOne(id);
    if (!user.isActive) return; // idempotent

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.authService.revokeAllUserTokens(id);

    this.logger.log(`User deactivated: ${id} by actor ${actorId}`);
  }

  async reactivate(id: string, actorId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('users.notFound');
    if (user.isActive) return; // idempotent

    await this.prisma.user.update({ where: { id }, data: { isActive: true } });
    this.logger.log(`User reactivated: ${id} by actor ${actorId}`);
  }

  async resendSetup(id: string, actorId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('users.notFound');

    // Invalidate any existing setup token for this user
    await this.invalidateSetupToken(id);

    await this.sendSetupEmail(id, user.email, user.name, actorId);
    this.logger.log(`Setup email resent for user ${id} by actor ${actorId}`);
  }

  // ── Token generation (called by AuthService for password reset) ──

  async generateResetToken(email: string): Promise<void> {
    // Always returns 200 regardless — no user enumeration
    const user = await this.prisma.user.findUnique({
      where: { email, isActive: true },
    });
    if (!user) return;

    const jti = uuidv4();
    const token = await this.jwt.signAsync(
      { sub: user.id, jti, type: 'reset' },
      {
        secret: this.cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '24h',
      },
    );

    await this.redis.setex(`${RESET_TOKEN_PREFIX}${user.id}:${jti}`, RESET_TOKEN_TTL_SECONDS, '1');

    const resetUrl = `${this.cfg.getOrThrow<string>('APP_URL')}/auth/reset-password?token=${token}`;
    await this.mail.enqueue({
      to: user.email,
      template: 'password-reset',
      context: { name: user.name, resetUrl },
    });
  }

  async consumeSetupToken(token: string): Promise<{ userId: string; jti: string }> {
    return this.verifyOneTimeToken(token, 'setup', SETUP_TOKEN_PREFIX);
  }

  async consumeResetToken(token: string): Promise<{ userId: string; jti: string }> {
    return this.verifyOneTimeToken(token, 'reset', RESET_TOKEN_PREFIX);
  }

  async markTokenUsed(prefix: string, userId: string, jti: string): Promise<void> {
    await this.redis.del(`${prefix}${userId}:${jti}`);
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async sendSetupEmail(
    userId: string,
    email: string,
    name: string,
    _actorId: string,
  ): Promise<void> {
    const jti = uuidv4();
    const token = await this.jwt.signAsync(
      { sub: userId, jti, type: 'setup' },
      {
        secret: this.cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '24h',
      },
    );

    await this.redis.setex(`${SETUP_TOKEN_PREFIX}${userId}:${jti}`, SETUP_TOKEN_TTL_SECONDS, '1');

    const setupUrl = `${this.cfg.getOrThrow<string>('APP_URL')}/auth/setup?token=${token}`;
    await this.mail.enqueue({
      to: email,
      template: 'setup-account',
      context: { name, setupUrl },
    });
  }

  private async invalidateSetupToken(userId: string): Promise<void> {
    const pattern = `${SETUP_TOKEN_PREFIX}${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async verifyOneTimeToken(
    token: string,
    expectedType: string,
    prefix: string,
  ): Promise<{ userId: string; jti: string }> {
    let payload: { sub: string; jti: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new Error('auth.invalidToken');
    }

    if (payload.type !== expectedType) throw new Error('auth.invalidToken');

    const exists = await this.redis.get(`${prefix}${payload.sub}:${payload.jti}`);
    if (exists !== '1') throw new Error('auth.tokenAlreadyUsed');

    return { userId: payload.sub, jti: payload.jti };
  }
}
