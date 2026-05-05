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
import { DocumentsService } from '../assets/documents.service';

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
    getAnalyticsPdf: jest.fn(),
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
    updateHoldMetadata: jest.fn(),
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
        {
          provide: DocumentsService,
          useValue: {
            findByWorkOrder: jest.fn().mockResolvedValue([]),
            uploadForWorkOrder: jest.fn(),
            getDownloadUrl: jest.fn().mockResolvedValue('https://storage/presigned'),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        },
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

  // ── GET /work-orders — isOverdue filter (§9.3) ──────────────────────────────

  it('GET /work-orders?isOverdue=true passes isOverdue:true to the service', async () => {
    workOrders.findAll.mockResolvedValue({ data: [], total: 0 });

    const response = await request(app.getHttpServer())
      .get('/work-orders?isOverdue=true')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(workOrders.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ isOverdue: true }),
    );
  });

  it('GET /work-orders?isOverdue=false passes isOverdue:false to the service', async () => {
    workOrders.findAll.mockResolvedValue({ data: [], total: 0 });

    const response = await request(app.getHttpServer())
      .get('/work-orders?isOverdue=false')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(workOrders.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ isOverdue: false }),
    );
  });

  it('GET /work-orders without isOverdue does not include the property', async () => {
    workOrders.findAll.mockResolvedValue({ data: [], total: 0 });

    const response = await request(app.getHttpServer())
      .get('/work-orders')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    const calledWith = workOrders.findAll.mock.calls[0][0] as Record<string, unknown>;
    expect(calledWith.isOverdue).toBeUndefined();
  });

  it('GET /work-orders?isOverdue=notabool coerces to false (Transform converts non-"true" to false)', async () => {
    // The @Transform decorator maps any value that is not the string "true" or boolean true
    // to false — consistent with the isActive pattern in PartQueryDto. A non-"true" string
    // is treated as isOverdue:false (no overdue filter applied) rather than a 400.
    workOrders.findAll.mockResolvedValue({ data: [], total: 0 });

    const response = await request(app.getHttpServer())
      .get('/work-orders?isOverdue=notabool')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(workOrders.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ isOverdue: false }),
    );
  });

  it('GET /work-orders?isOverdue=true is accessible to TECHNICIAN role', async () => {
    workOrders.findAll.mockResolvedValue({ data: [], total: 0 });

    const response = await request(app.getHttpServer())
      .get('/work-orders?isOverdue=true')
      .set('Authorization', 'Bearer TECHNICIAN');

    expect(response.status).toBe(200);
  });

  it('GET /work-orders?isOverdue=true returns 401 without auth', async () => {
    const response = await request(app.getHttpServer()).get('/work-orders?isOverdue=true');

    expect(response.status).toBe(401);
    expect(workOrders.findAll).not.toHaveBeenCalled();
  });

  // ── END isOverdue filter tests ───────────────────────────────────────────────

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

  it('PATCH /work-orders/:id/on-hold rejects technician-owned supervisorAssetStatusChoice data', async () => {
    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/on-hold')
      .set('Authorization', 'Bearer TECHNICIAN')
      .send({
        reasonType: 'OTHER',
        supervisorAssetStatusChoice: 'OUT_OF_SERVICE',
      });

    expect(response.status).toBe(400);
    expect(onHold.putOnHold).not.toHaveBeenCalled();
  });

  it('PATCH /work-orders/:id/hold-metadata lets supervisors send supervisorAssetStatusChoice', async () => {
    onHold.updateHoldMetadata.mockResolvedValue({ id: 'wo-1' });

    const response = await request(app.getHttpServer())
      .patch('/work-orders/wo-1/hold-metadata')
      .set('Authorization', 'Bearer SUPERVISOR')
      .send({
        expectedResolutionDate: '2026-05-01T10:00:00.000Z',
        supervisorAssetStatusChoice: 'OUT_OF_SERVICE',
      });

    expect(response.status).toBe(200);
    expect(onHold.updateHoldMetadata).toHaveBeenCalledWith(
      'wo-1',
      {
        expectedResolutionDate: '2026-05-01T10:00:00.000Z',
        supervisorAssetStatusChoice: 'OUT_OF_SERVICE',
      },
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

  it('GET /work-orders/:id returns validation insight fields for supervisor validation view', async () => {
    workOrders.findById.mockResolvedValue({
      id: 'wo-1',
      referenceNumber: 'WO-2026-001',
      status: 'PENDING_VALIDATION',
      contractorCost: null,
      interventionLogs: [],
      stockMovements: [],
      contributorsWithoutLog: [{ technicianId: 'tech-2', name: 'Contributor B' }],
      hasNotableTimeDeviation: true,
      timeDeviation: {
        estimatedDurationMinutes: 120,
        actualDurationMinutes: 180,
        deltaMinutes: 60,
        deltaPercent: 50,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/work-orders/wo-1')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(response.body.contributorsWithoutLog).toEqual([
      { technicianId: 'tech-2', name: 'Contributor B' },
    ]);
    expect(response.body.hasNotableTimeDeviation).toBe(true);
    expect(response.body.timeDeviation).toEqual({
      estimatedDurationMinutes: 120,
      actualDurationMinutes: 180,
      deltaMinutes: 60,
      deltaPercent: 50,
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

  it('GET /work-orders/analytics/export-pdf returns a PDF for supervisors', async () => {
    workOrders.getAnalyticsPdf.mockResolvedValue(Buffer.from('%PDF-1.4 mock'));

    const response = await request(app.getHttpServer())
      .get('/work-orders/analytics/export-pdf?periodDays=45&categoryId=cat-1')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(response.status).toBe(200);
    expect(workOrders.getAnalyticsPdf).toHaveBeenCalledWith(45, 'cat-1');
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment; filename="supervisor-analytics-45d.pdf"');
  });

  it('GET /work-orders/analytics/export-pdf coerces invalid period to 30 and minimum 1', async () => {
    workOrders.getAnalyticsPdf.mockResolvedValue(Buffer.from('%PDF-1.4 mock'));

    const responseInvalid = await request(app.getHttpServer())
      .get('/work-orders/analytics/export-pdf?periodDays=oops')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(responseInvalid.status).toBe(200);
    expect(workOrders.getAnalyticsPdf).toHaveBeenCalledWith(30, undefined);

    const responseMin = await request(app.getHttpServer())
      .get('/work-orders/analytics/export-pdf?periodDays=0')
      .set('Authorization', 'Bearer SUPERVISOR');

    expect(responseMin.status).toBe(200);
    expect(workOrders.getAnalyticsPdf).toHaveBeenCalledWith(30, undefined);
  });

  it('GET /work-orders/analytics/export-pdf returns 403 for non-supervisor roles', async () => {
    const response = await request(app.getHttpServer())
      .get('/work-orders/analytics/export-pdf')
      .set('Authorization', 'Bearer TECHNICIAN');

    expect(response.status).toBe(403);
    expect(workOrders.getAnalyticsPdf).not.toHaveBeenCalled();
  });

  it('GET /work-orders/analytics/export-pdf returns 401 when auth is missing', async () => {
    const response = await request(app.getHttpServer())
      .get('/work-orders/analytics/export-pdf');

    expect(response.status).toBe(401);
    expect(workOrders.getAnalyticsPdf).not.toHaveBeenCalled();
  });

  // ── GET /work-orders/:id/documents (§11.2) ────────────────────────────────

  it('GET /work-orders/:id/documents returns 401 without auth', async () => {
    const response = await request(app.getHttpServer()).get('/work-orders/wo-1/documents');
    expect(response.status).toBe(401);
  });

  it('GET /work-orders/:id/documents returns 403 for non-supervisor roles', async () => {
    const response = await request(app.getHttpServer())
      .get('/work-orders/wo-1/documents')
      .set('Authorization', 'Bearer TECHNICIAN');
    expect(response.status).toBe(403);
  });

  it('GET /work-orders/:id/documents returns 200 for supervisors', async () => {
    const response = await request(app.getHttpServer())
      .get('/work-orders/wo-1/documents')
      .set('Authorization', 'Bearer SUPERVISOR');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('DELETE /work-orders/:id/documents/:docId returns 401 without auth', async () => {
    const response = await request(app.getHttpServer()).delete('/work-orders/wo-1/documents/doc-1');
    expect(response.status).toBe(401);
  });

  it('DELETE /work-orders/:id/documents/:docId returns 403 for non-supervisor roles', async () => {
    const response = await request(app.getHttpServer())
      .delete('/work-orders/wo-1/documents/doc-1')
      .set('Authorization', 'Bearer TECHNICIAN');
    expect(response.status).toBe(403);
  });

  it('GET /work-orders/:id/documents/:docId/download returns presigned URL for supervisors', async () => {
    const response = await request(app.getHttpServer())
      .get('/work-orders/wo-1/documents/doc-1/download')
      .set('Authorization', 'Bearer SUPERVISOR');
    expect(response.status).toBe(200);
    expect(response.text).toBe('https://storage/presigned');
  });
});
