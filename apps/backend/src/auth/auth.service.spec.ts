import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { User } from '@gmao/db';
import type { Response } from 'express';
import { AuthService } from './auth.service';

type PipelineMock = {
  setex: jest.Mock;
  sadd: jest.Mock;
  expire: jest.Mock;
  del: jest.Mock;
  srem: jest.Mock;
  exec: jest.Mock;
};

function createPipeline(): PipelineMock {
  const pipeline = {
    setex: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    srem: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  } as PipelineMock;

  pipeline.setex.mockReturnValue(pipeline);
  pipeline.sadd.mockReturnValue(pipeline);
  pipeline.expire.mockReturnValue(pipeline);
  pipeline.del.mockReturnValue(pipeline);
  pipeline.srem.mockReturnValue(pipeline);

  return pipeline;
}

function createService(configuredSessionHours: string | null = '8') {
  const prisma = {
    user: {
      update: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn(),
    },
  };

  const jwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const cfg = {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
      };
      return map[key];
    }),
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
      if (key === 'NODE_ENV') return 'test';
      return defaultValue;
    }),
  } as unknown as ConfigService;

  const systemConfig = {
    get: jest.fn().mockResolvedValue(configuredSessionHours),
    validatePassword: jest.fn(),
  };

  const pipelines: PipelineMock[] = [];
  const redis = {
    pipeline: jest.fn(() => {
      const pipeline = createPipeline();
      pipelines.push(pipeline);
      return pipeline;
    }),
    get: jest.fn(),
    smembers: jest.fn(),
  };

  const usersService = {
    consumeSetupToken: jest.fn(),
    markTokenUsed: jest.fn(),
    generateResetToken: jest.fn(),
    consumeResetToken: jest.fn(),
    resendSetupByEmail: jest.fn(),
  };

  const service = new AuthService(
    prisma as never,
    jwt as never,
    cfg,
    systemConfig as never,
    redis as never,
    usersService as never,
  );

  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  return {
    service,
    prisma,
    jwt,
    cfg,
    systemConfig,
    redis,
    pipelines,
    response,
    usersService,
  };
}

describe('AuthService session timeout enforcement', () => {
  const user: User = {
    id: 'user-1',
    name: 'Supervisor One',
    email: 'supervisor@gmao.local',
    passwordHash: 'hash',
    roles: ['SUPERVISOR'],
    isActive: true,
    hourlyRate: '0.00',
    createdAt: new Date('2026-04-17T00:00:00.000Z'),
    updatedAt: new Date('2026-04-17T00:00:00.000Z'),
    lastLoginAt: null,
  } as unknown as User;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses SESSION_IDLE_TIMEOUT_HOURS for refresh JWT, Redis TTL, and cookie maxAge during login', async () => {
    const { service, jwt, pipelines, response, systemConfig } = createService('8');
    jwt.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.login(user, response);

    expect(systemConfig.get).toHaveBeenCalledWith('SESSION_IDLE_TIMEOUT_HOURS');
    expect(jwt.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: 'user-1', jti: expect.any(String) }),
      expect.objectContaining({ expiresIn: 8 * 60 * 60 }),
    );

    const storePipeline = pipelines[0];
    expect(storePipeline.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^rt:user-1:/),
      8 * 60 * 60,
      '1',
    );
    expect(storePipeline.expire).toHaveBeenCalledWith('rt-set:user-1', 8 * 60 * 60);
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({
        path: '/api/v1/auth',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
      }),
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      roles: ['SUPERVISOR'],
      userId: 'user-1',
      name: 'Supervisor One',
      idleTimeoutHours: 8,
    });
  });

  it('rotates refresh token with configured inactivity timeout during refresh()', async () => {
    const { service, jwt, redis, prisma, pipelines, response, systemConfig } = createService('2');

    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'old-jti' });
    redis.get.mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue(user);
    jwt.signAsync
      .mockResolvedValueOnce('access-token-2')
      .mockResolvedValueOnce('refresh-token-2');

    const result = await service.refresh('raw-refresh-token', response);

    expect(systemConfig.get).toHaveBeenCalledWith('SESSION_IDLE_TIMEOUT_HOURS');
    expect(pipelines).toHaveLength(2);

    const revokePipeline = pipelines[0];
    expect(revokePipeline.del).toHaveBeenCalledWith('rt:user-1:old-jti');
    expect(revokePipeline.srem).toHaveBeenCalledWith('rt-set:user-1', 'old-jti');

    const storePipeline = pipelines[1];
    expect(storePipeline.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^rt:user-1:/),
      2 * 60 * 60,
      '1',
    );
    expect(storePipeline.expire).toHaveBeenCalledWith('rt-set:user-1', 2 * 60 * 60);

    expect(jwt.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: 'user-1', jti: expect.any(String) }),
      expect.objectContaining({ expiresIn: 2 * 60 * 60 }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token-2',
      expect.objectContaining({ maxAge: 2 * 60 * 60 * 1000 }),
    );
    expect(result.accessToken).toBe('access-token-2');
  });

  it('falls back to 8 hours (spec §3.4 default) when SESSION_IDLE_TIMEOUT_HOURS is invalid', async () => {
    const { service, jwt, pipelines, response, systemConfig } = createService('0');
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation();

    jwt.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.login(user, response);

    expect(systemConfig.get).toHaveBeenCalledWith('SESSION_IDLE_TIMEOUT_HOURS');
    expect(jwt.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: 'user-1', jti: expect.any(String) }),
      expect.objectContaining({ expiresIn: 8 * 60 * 60 }),
    );
    expect(pipelines[0].setex).toHaveBeenCalledWith(
      expect.stringMatching(/^rt:user-1:/),
      8 * 60 * 60,
      '1',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ maxAge: 8 * 60 * 60 * 1000 }),
    );
    expect(result.idleTimeoutHours).toBe(8);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects refresh when token was revoked', async () => {
    const { service, jwt, redis, response } = createService('8');
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'revoked-jti' });
    redis.get.mockResolvedValue(null);

    await expect(service.refresh('revoked-token', response)).rejects.toEqual(
      new UnauthorizedException('auth.refreshTokenRevoked'),
    );
  });

  it('rejects refresh when refresh token signature is invalid', async () => {
    const { service, jwt, response } = createService('8');
    jwt.verifyAsync.mockRejectedValue(new Error('invalid'));

    await expect(service.refresh('bad-token', response)).rejects.toEqual(
      new UnauthorizedException('auth.invalidRefreshToken'),
    );
  });

  it('delegates public resend setup requests to UsersService.resendSetupByEmail', async () => {
    const { service, usersService } = createService('8');

    await service.resendSetup('new.user@gmao.local');

    expect(usersService.resendSetupByEmail).toHaveBeenCalledWith('new.user@gmao.local');
  });

  // §3.4: idleTimeoutHours in auth responses
  it('login() returns configured idleTimeoutHours in the response body', async () => {
    const { service, jwt, response } = createService('12');
    jwt.signAsync.mockResolvedValueOnce('at').mockResolvedValueOnce('rt');

    const result = await service.login(user, response);

    expect(result.idleTimeoutHours).toBe(12);
  });

  it('refresh() returns configured idleTimeoutHours in the response body', async () => {
    const { service, jwt, redis, prisma, response } = createService('3');
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'j1' });
    redis.get.mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue(user);
    jwt.signAsync.mockResolvedValueOnce('at2').mockResolvedValueOnce('rt2');

    const result = await service.refresh('old-rt', response);

    expect(result.idleTimeoutHours).toBe(3);
  });

  it('idleTimeoutHours equals SESSION_IDLE_TIMEOUT_HOURS when configured to 24', async () => {
    const { service, jwt, response } = createService('24');
    jwt.signAsync.mockResolvedValueOnce('at').mockResolvedValueOnce('rt');

    const result = await service.login(user, response);

    expect(result.idleTimeoutHours).toBe(24);
    // Refresh TTL aligns: 24h = 86400 s
    expect(jwt.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ expiresIn: 24 * 60 * 60 }),
    );
  });
});

describe('AuthService.changePassword', () => {
  const USER_ID = 'user-cp-1';

  it('throws BadRequestException when current password is incorrect', async () => {
    const { service, prisma, systemConfig } = createService();
    const realHash = await import('bcryptjs').then((m) => m.hash('correct-pass', 12));
    prisma.user.findUnique.mockResolvedValue({ passwordHash: realHash });
    systemConfig.validatePassword.mockResolvedValue(null);

    await expect(
      service.changePassword(USER_ID, 'wrong-pass', 'NewPass@123'),
    ).rejects.toThrow('auth.changePassword.incorrectCurrentPassword');
  });

  it('throws BadRequestException when new password fails policy', async () => {
    const { service, prisma, systemConfig } = createService();
    const realHash = await import('bcryptjs').then((m) => m.hash('current-pass', 12));
    prisma.user.findUnique.mockResolvedValue({ passwordHash: realHash });
    systemConfig.validatePassword.mockResolvedValue('password.tooShort');

    await expect(
      service.changePassword(USER_ID, 'current-pass', 'weak'),
    ).rejects.toThrow('password.tooShort');
  });

  it('updates the password hash when current password is correct and new password passes policy', async () => {
    const { service, prisma, systemConfig } = createService();
    const realHash = await import('bcryptjs').then((m) => m.hash('current-pass', 12));
    prisma.user.findUnique.mockResolvedValue({ passwordHash: realHash });
    prisma.user.update.mockResolvedValue({});
    systemConfig.validatePassword.mockResolvedValue(null);

    await service.changePassword(USER_ID, 'current-pass', 'NewStrongPass@123');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    );
  });

  it('throws BadRequestException when user has no password set', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({ passwordHash: null });

    await expect(
      service.changePassword(USER_ID, 'current-pass', 'NewPass@123'),
    ).rejects.toThrow('auth.changePassword.noPasswordSet');
  });
});
