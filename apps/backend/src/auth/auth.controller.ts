import {
  Controller,
  Post,
  UseGuards,
  Req,
  Res,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import type { User } from '@gmao/db';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import type { AccessTokenPayload } from './types/jwt-payload.type';

interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
  cookies: Record<string, string | undefined>;
}

interface LocalAuthRequest extends Request {
  user: User;
  cookies: Record<string, string | undefined>;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * LocalAuthGuard runs first (validates email+password via LocalStrategy),
   * populates req.user with the User record, then the handler fires.
   * LoginDto is validated by the global ValidationPipe before the guard runs.
   */
  @Post('login')
  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(
    @Body() _dto: LoginDto,
    @Req() req: LocalAuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.login(req.user, res);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Rotate access token using the refresh cookie' })
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const token = req.cookies['refresh_token'];
    if (!token) throw new UnauthorizedException('auth.noRefreshToken');
    return this.authService.refresh(token, res);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate refresh token and clear cookie' })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = req.cookies['refresh_token'] ?? '';
    await this.authService.logout(token, res);
  }
}
