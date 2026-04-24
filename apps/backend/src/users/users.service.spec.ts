import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const USER_ID = 'user-abc';

function buildModule(prismaOverrides: Record<string, unknown>) {
  return Test.createTestingModule({
    providers: [
      UsersService,
      { provide: PrismaService, useValue: prismaOverrides },
      { provide: JwtService, useValue: { verifyAsync: jest.fn(), signAsync: jest.fn() } },
      { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('secret') } },
      { provide: MailService, useValue: { enqueue: jest.fn() } },
      { provide: AuthService, useValue: { invalidateAllUserSessions: jest.fn() } },
      { provide: REDIS_CLIENT, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]) } },
    ],
  }).compile();
}

describe('UsersService.getPreferences', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    const module: TestingModule = await buildModule(prisma as never);
    service = module.get(UsersService);
  });

  it('returns emailNotificationsEnabled for an existing user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ emailNotificationsEnabled: true });

    const result = await service.getPreferences(USER_ID);

    expect(result).toEqual({ emailNotificationsEnabled: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: { emailNotificationsEnabled: true },
    });
  });

  it('throws NotFoundException when user does not exist', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getPreferences(USER_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.updateEmailNotificationsPreference', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const module: TestingModule = await buildModule(prisma as never);
    service = module.get(UsersService);
  });

  it('updates emailNotificationsEnabled to false and returns new value', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID });
    (prisma.user.update as jest.Mock).mockResolvedValue({ emailNotificationsEnabled: false });

    const result = await service.updateEmailNotificationsPreference(USER_ID, false);

    expect(result).toEqual({ emailNotificationsEnabled: false });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { emailNotificationsEnabled: false },
      select: { emailNotificationsEnabled: true },
    });
  });

  it('updates emailNotificationsEnabled to true', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER_ID });
    (prisma.user.update as jest.Mock).mockResolvedValue({ emailNotificationsEnabled: true });

    const result = await service.updateEmailNotificationsPreference(USER_ID, true);

    expect(result.emailNotificationsEnabled).toBe(true);
  });

  it('throws NotFoundException when user does not exist', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.updateEmailNotificationsPreference(USER_ID, true)).rejects.toThrow(NotFoundException);
  });

  it('does not call update when user not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.updateEmailNotificationsPreference(USER_ID, true)).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('UsersService.listActiveTechnicians', () => {
  let service: UsersService;
  let prisma: { user: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findMany: jest.fn() } };
    const module: TestingModule = await buildModule(prisma as never);
    service = module.get(UsersService);
  });

  it('returns only active TECHNICIAN users ordered by createdAt', async () => {
    const mockTechs = [
      { id: 't1', email: 't1@test.com', name: 'Alice', roles: ['TECHNICIAN'], isActive: true, hourlyRate: null, lastLoginAt: null, createdAt: new Date() },
      { id: 't2', email: 't2@test.com', name: 'Bob', roles: ['TECHNICIAN'], isActive: true, hourlyRate: null, lastLoginAt: null, createdAt: new Date() },
    ];
    (prisma.user.findMany as jest.Mock).mockResolvedValue(mockTechs);

    const result = await service.listActiveTechnicians();

    expect(result).toHaveLength(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roles: { has: 'TECHNICIAN' },
          isActive: true,
        }),
      }),
    );
  });
});

describe('UsersService.resendSetupByEmail', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock } };
  let redis: { keys: jest.Mock; del: jest.Mock; setex: jest.Mock };
  let mail: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    redis = { keys: jest.fn(), del: jest.fn(), setex: jest.fn() };
    mail = { enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { verifyAsync: jest.fn(), signAsync: jest.fn().mockResolvedValue('setup-token') } },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('secret') } },
        { provide: MailService, useValue: mail },
        { provide: AuthService, useValue: { invalidateAllUserSessions: jest.fn() } },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('invalidates existing setup tokens and sends a fresh setup email for inactive users', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: USER_ID,
      email: 'new.user@gmao.local',
      name: 'New User',
      isActive: false,
    });
    (redis.keys as jest.Mock).mockResolvedValue(['setup:user-abc:old-jti']);

    await service.resendSetupByEmail('new.user@gmao.local');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'new.user@gmao.local' },
      select: { id: true, email: true, name: true, isActive: true },
    });
    expect(redis.keys).toHaveBeenCalledWith('setup:user-abc:*');
    expect(redis.del).toHaveBeenCalledWith('setup:user-abc:old-jti');
    expect(mail.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new.user@gmao.local',
        template: 'setup-account',
        context: expect.objectContaining({
          name: 'New User',
          setupUrl: expect.stringContaining('/setup?token=setup-token'),
        }),
      }),
    );
  });

  it('does nothing when the email does not belong to an inactive user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await service.resendSetupByEmail('missing@gmao.local');

    expect(redis.keys).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });

  it('does nothing for active users', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: USER_ID,
      email: 'active@gmao.local',
      name: 'Active User',
      isActive: true,
    });

    await service.resendSetupByEmail('active@gmao.local');

    expect(redis.keys).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });
});
