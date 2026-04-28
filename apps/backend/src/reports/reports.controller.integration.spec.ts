import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { Role } from '@gmao/shared';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

interface TestUser {
  sub: string;
  roles: Role[];
}

class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: TestUser;
    }>();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException();
    }

    const rawRole = authHeader.replace(/^Bearer\s+/i, '').trim();
    req.user = {
      sub: 'user-1',
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

describe('ReportsController integration', () => {
  let app: INestApplication;

  const reports = {
    findAll: jest.fn(),
    findById: jest.fn(),
    submit: jest.fn(),
    addComment: jest.fn(),
    acknowledgeComment: jest.fn(),
    convert: jest.fn(),
    reject: jest.fn(),
    defer: jest.fn(),
    reopen: jest.fn(),
    archive: jest.fn(),
  };

  async function buildApp(): Promise<INestApplication> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: reports },
        { provide: APP_GUARD, useClass: MockJwtAuthGuard },
        { provide: APP_GUARD, useClass: MockRolesGuard },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await nestApp.init();

    return nestApp;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    reports.findAll.mockResolvedValue({ data: [], total: 0 });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /reports returns 401 when authentication is missing', async () => {
    const response = await request(app.getHttpServer()).get('/reports');

    expect(response.status).toBe(401);
    expect(reports.findAll).not.toHaveBeenCalled();
  });

  it('GET /reports returns 403 for ADMIN role (non-operational role)', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', 'Bearer ADMIN');

    expect(response.status).toBe(403);
    expect(reports.findAll).not.toHaveBeenCalled();
  });

  it('GET /reports returns 200 and passes transformed query values', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports?status=PENDING&urgencyPerception=MACHINE_STOPPED&page=2&limit=5')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(reports.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        urgencyPerception: 'MACHINE_STOPPED',
        page: 2,
        limit: 5,
      }),
    );
  });

  it('GET /reports is accessible to REQUESTER role', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', 'Bearer REQUESTER');

    expect(response.status).toBe(200);
    expect(reports.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('GET /reports returns 400 for invalid urgencyPerception', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports?urgencyPerception=INVALID')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(400);
    expect(reports.findAll).not.toHaveBeenCalled();
  });

  it('GET /reports returns 400 for page below minimum', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports?page=0')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(400);
    expect(reports.findAll).not.toHaveBeenCalled();
  });
});
