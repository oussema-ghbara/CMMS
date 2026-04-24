import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import request = require('supertest');
import { Role } from '@gmao/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      sub: 'user-1',
      email: 'supervisor@gmao.local',
      roles: [Role.SUPERVISOR],
    };
    return true;
  }
}

describe('AuthController integration', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    setupAccount: jest.fn(),
    resendSetup: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: JwtAuthGuard, useClass: MockJwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /auth/refresh returns 401 when refresh cookie is missing', async () => {
    const response = await request(app.getHttpServer()).post('/auth/refresh').send();

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('auth.noRefreshToken');
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('POST /auth/refresh returns 200 and delegates to AuthService.refresh when cookie is present', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'new-access-token',
      userId: 'user-1',
      name: 'Supervisor One',
      roles: [Role.SUPERVISOR],
    });

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', ['refresh_token=valid-refresh-token'])
      .send();

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('new-access-token');
    expect(authService.refresh).toHaveBeenCalledWith('valid-refresh-token', expect.any(Object));
  });

  it('POST /auth/refresh returns 401 when service rejects refresh token', async () => {
    authService.refresh.mockRejectedValue(new UnauthorizedException('auth.invalidRefreshToken'));

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', ['refresh_token=bad-token'])
      .send();

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('auth.invalidRefreshToken');
  });

  it('POST /auth/resend-setup returns 204 and delegates to AuthService.resendSetup', async () => {
    authService.resendSetup.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .post('/auth/resend-setup')
      .send({ email: 'new.user@gmao.local' });

    expect(response.status).toBe(204);
    expect(authService.resendSetup).toHaveBeenCalledWith('new.user@gmao.local');
  });

  it('POST /auth/resend-setup returns 400 for invalid email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/resend-setup')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(authService.resendSetup).not.toHaveBeenCalled();
  });
});
