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
import { Role, WOCancellationReason } from '@gmao/shared';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { AssignmentService } from './assignment.service';
import { InterventionService } from './intervention.service';
import { OnHoldService } from './on-hold.service';
import { ValidationService } from './validation.service';
import { ChecklistService } from './checklist.service';

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
      sub: 'supervisor-1',
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

describe('WorkOrdersController integration', () => {
  let app: INestApplication;

  const workOrders = {
    findAll: jest.fn(),
    getAnalytics: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    publish: jest.fn(),
    cancel: jest.fn(),
    changePriority: jest.fn(),
    authorizeSimultaneousMaintenance: jest.fn(),
    getStatusHistory: jest.fn(),
  };

  const assignment = {
    assign: jest.fn(),
    reassign: jest.fn(),
    promote: jest.fn(),
    raiseContributorBlock: jest.fn(),
    resolveContributorBlock: jest.fn(),
  };

  const intervention = {
    start: jest.fn(),
    submitClosure: jest.fn(),
  };

  const onHold = {
    putOnHold: jest.fn(),
    resume: jest.fn(),
  };

  const validation = {
    validate: jest.fn(),
    reject: jest.fn(),
  };

  const checklist = {
    completeChecklistItem: jest.fn(),
    markChecklistItemNotApplicable: jest.fn(),
  };

  async function buildApp(): Promise<INestApplication> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WorkOrdersController],
      providers: [
        { provide: WorkOrdersService, useValue: workOrders },
        { provide: AssignmentService, useValue: assignment },
        { provide: InterventionService, useValue: intervention },
        { provide: OnHoldService, useValue: onHold },
        { provide: ValidationService, useValue: validation },
        { provide: ChecklistService, useValue: checklist },
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
    workOrders.cancel.mockResolvedValue({ id: 'wo-1', status: 'CANCELLED' });
    assignment.promote.mockResolvedValue({ id: 'wo-1', status: 'ASSIGNED' });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('PATCH /work-orders/:id/cancel returns 401 when authentication is missing', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/cancel')
      .send({ reason: WOCancellationReason.DUPLICATE });

    expect(response.status).toBe(401);
    expect(workOrders.cancel).not.toHaveBeenCalled();
  });

  it('PATCH /work-orders/:id/cancel returns 403 for non-supervisor roles', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/cancel')
      .set('Authorization', 'Bearer TECHNICIAN')
      .send({ reason: WOCancellationReason.DUPLICATE });

    expect(response.status).toBe(403);
    expect(workOrders.cancel).not.toHaveBeenCalled();
  });

  it.each([
    WOCancellationReason.EXTERNAL_DECISION,
    WOCancellationReason.RESOLVED_OTHERWISE,
  ])('PATCH /work-orders/:id/cancel returns 400 when %s has no detail', async (reason) => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/cancel')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({ reason });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining(['workOrders.cancellationDetailRequired']),
    );
    expect(workOrders.cancel).not.toHaveBeenCalled();
  });

  it('PATCH /work-orders/:id/cancel returns 400 when detail is whitespace-only for required reasons', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/cancel')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({
        reason: WOCancellationReason.EXTERNAL_DECISION,
        detail: '   ',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining(['workOrders.cancellationDetailRequired']),
    );
    expect(workOrders.cancel).not.toHaveBeenCalled();
  });

  it('PATCH /work-orders/:id/cancel succeeds without detail for non-required reasons', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/cancel')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({ reason: WOCancellationReason.DUPLICATE });

    expect(response.status).toBe(200);
    expect(workOrders.cancel).toHaveBeenCalledWith(
      'wo-1',
      { reason: WOCancellationReason.DUPLICATE },
      'supervisor-1',
    );
  });

  it('PATCH /work-orders/:id/cancel succeeds with detail for required reasons', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/cancel')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({
        reason: WOCancellationReason.RESOLVED_OTHERWISE,
        detail: 'Resolved externally by certified contractor',
      });

    expect(response.status).toBe(200);
    expect(workOrders.cancel).toHaveBeenCalledWith(
      'wo-1',
      {
        reason: WOCancellationReason.RESOLVED_OTHERWISE,
        detail: 'Resolved externally by certified contractor',
      },
      'supervisor-1',
    );
  });

  it('PATCH /work-orders/:id/promote returns 403 for non-supervisor roles', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/promote')
      .set('Authorization', 'Bearer TECHNICIAN')
      .send({ newPrincipalId: 'tech-new' });

    expect(response.status).toBe(403);
    expect(assignment.promote).not.toHaveBeenCalled();
  });

  it('PATCH /work-orders/:id/promote returns 400 when newPrincipalId is missing', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/promote')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({});

    expect(response.status).toBe(400);
    expect(assignment.promote).not.toHaveBeenCalled();
  });

  it('PATCH /work-orders/:id/promote succeeds for supervisors with a valid contributor', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/promote')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({ newPrincipalId: 'tech-new' });

    expect(response.status).toBe(200);
    expect(assignment.promote).toHaveBeenCalledWith(
      'wo-1',
      { newPrincipalId: 'tech-new' },
      'supervisor-1',
    );
  });

  it('GET /work-orders/:id attaches a computed costSummary to the WO detail', async () => {
    workOrders.findById.mockResolvedValue({
      id: 'wo-1',
      referenceNumber: 'WO-2026-001',
      status: 'CLOSED',
      contractorCost: '100.00',
      interventionLogs: [
        { activeDurationMinutes: 120, hourlyRateAtTime: '30.00' },
      ],
      stockMovements: [
        { type: 'OUTGOING', quantity: 2, unitCostAtTime: '15.00' },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/work-orders/wo-1')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(workOrders.findById).toHaveBeenCalledWith('wo-1');
    expect(response.body.costSummary).toEqual({
      laborCost: 60,
      partsCost: 30,
      contractorCost: 100,
      totalCost: 190,
    });
  });

  it('GET /work-orders/:id returns zero costSummary for a WO without any cost data', async () => {
    workOrders.findById.mockResolvedValue({
      id: 'wo-1',
      referenceNumber: 'WO-2026-001',
      status: 'OPEN',
      contractorCost: null,
      interventionLogs: [],
      stockMovements: [],
    });

    const response = await request(app.getHttpServer())
      .get('/work-orders/wo-1')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(response.body.costSummary).toEqual({
      laborCost: 0,
      partsCost: 0,
      contractorCost: 0,
      totalCost: 0,
    });
  });

  it('GET /work-orders/analytics returns the analytics payload including cost summary', async () => {
    workOrders.getAnalytics.mockResolvedValue({
      periodDays: 45,
      summary: {
        total: 3,
        open: 1,
        overdue: 0,
        closedThisPeriod: 1,
        cancelledThisPeriod: 1,
        resolutionRate: 0.5,
      },
      byStatus: {},
      byType: {},
      byPriority: {},
      avgResolutionDays: 4.2,
      costSummary: {
        contractorCost: 120,
        laborCost: 80.5,
        partsCost: 40,
        totalCost: 240.5,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/work-orders/analytics?periodDays=45')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(workOrders.getAnalytics).toHaveBeenCalledWith(45, undefined);
    expect(response.body.costSummary).toEqual({
      contractorCost: 120,
      laborCost: 80.5,
      partsCost: 40,
      totalCost: 240.5,
    });
  });
});
