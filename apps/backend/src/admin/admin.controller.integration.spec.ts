import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request = require('supertest');
import { Role } from '@gmao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminController } from './admin.controller';

interface TestUser {
  sub: string;
  email: string;
  roles: Role[];
}

class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: TestUser }>();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException();
    }

    const rawRole = authHeader.replace(/^Bearer\s+/i, '').trim();
    req.user = {
      sub: 'admin-1',
      email: 'admin@gmao.local',
      roles: [rawRole as Role],
    };

    return true;
  }
}

@Injectable()
class MockRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: TestUser }>();
    const roles = req.user?.roles ?? [];

    if (!requiredRoles.some((role) => roles.includes(role))) {
      throw new ForbiddenException();
    }

    return true;
  }
}

describe('AdminController integration', () => {
  let app: INestApplication;

  const prisma = {
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    systemConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const systemConfig = {
    set: jest.fn(),
  };

  const adminAnalytics = {
    getUserActivityStats: jest.fn(),
    getSystemHealthStats: jest.fn(),
  };

  async function buildApp(): Promise<INestApplication> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 100 }],
        }),
      ],
      controllers: [AdminController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: SystemConfigService, useValue: systemConfig },
        { provide: AdminAnalyticsService, useValue: adminAnalytics },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: MockJwtAuthGuard },
        { provide: APP_GUARD, useClass: MockRolesGuard },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    await nestApp.init();
    return nestApp;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/audit-log returns 401 when authentication is missing', async () => {
    const response = await request(app.getHttpServer()).get('/admin/audit-log');

    expect(response.status).toBe(401);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('GET /admin/audit-log returns 403 for non-admin users', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/audit-log')
      .set('Authorization', 'Bearer TECHNICIAN');

    expect(response.status).toBe(403);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('GET /admin/audit-log returns paginated data for admin users', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([{ id: 'audit-1' }]);
    prisma.auditLog.count.mockResolvedValueOnce(1);

    const response = await request(app.getHttpServer())
      .get('/admin/audit-log?page=2&limit=20')
      .set('Authorization', 'Bearer ADMIN');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [{ id: 'audit-1' }],
      total: 1,
      page: 2,
      limit: 20,
    });
  });

  it('GET /admin/audit-log returns 429 after exceeding route-specific rate limit', async () => {
    for (let i = 0; i < 10; i += 1) {
      const ok = await request(app.getHttpServer())
        .get('/admin/audit-log')
        .set('Authorization', 'Bearer ADMIN');
      expect(ok.status).toBe(200);
    }

    const blocked = await request(app.getHttpServer())
      .get('/admin/audit-log')
      .set('Authorization', 'Bearer ADMIN');

    expect(blocked.status).toBe(429);
  });
});
