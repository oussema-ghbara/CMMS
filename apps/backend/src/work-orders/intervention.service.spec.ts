import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InterventionService } from './intervention.service';
import { WorkOrderSource, WorkOrderStatus, WorkOrderType } from '@gmao/db';
import { ChecklistItemStatus } from '@gmao/db';

const ACTOR_ID = 'tech-1';
const WO_ID = 'wo-1';
const ASSET_ID = 'asset-1';
const LOCATION_PATH = 'Building A / Floor 1';

function buildWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: WO_ID,
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.IN_PROGRESS,
    assetId: ASSET_ID,
    priority: 'HIGH',
    sourcePlanId: null,
    principalTechnicianId: ACTOR_ID,
    ...overrides,
  };
}

function buildChecklistItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    description: 'Check pressure valve',
    status: ChecklistItemStatus.ANOMALY_DETECTED,
    autoCreateCorrectiveWO: true,
    workOrderId: WO_ID,
    ...overrides,
  };
}

function buildMocks() {
  const txWOCreate = jest.fn().mockResolvedValue({ id: 'new-wo-1' });
  const txWOUpdate = jest.fn().mockResolvedValue({});
  const txStatusLogCreate = jest.fn().mockResolvedValue({});
  const txInterventionLogFindFirst = jest.fn().mockResolvedValue(null);
  const txInterventionLogUpdate = jest.fn().mockResolvedValue({});
  const txActionCreateMany = jest.fn().mockResolvedValue({});

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    workOrder: {
      create: txWOCreate,
      update: txWOUpdate,
      findFirst: jest.fn().mockResolvedValue(null),
    },
    workOrderStatusLog: { create: txStatusLogCreate },
    interventionLog: {
      findFirst: txInterventionLogFindFirst,
      update: txInterventionLogUpdate,
    },
    interventionAction: { createMany: txActionCreateMany },
  };

  const prisma = {
    workOrderChecklistItem: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ hourlyRate: 50 }),
    },
    asset: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        location: { fullPath: LOCATION_PATH },
      }),
    },
    $transaction: jest
      .fn()
      .mockImplementation((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };

  const repo = { findById: jest.fn() };

  const notifications = { notifySupervisors: jest.fn().mockResolvedValue(undefined) };

  const service = new InterventionService(
    prisma as never,
    repo as never,
    notifications as never,
  );

  return { service, prisma, repo, notifications, tx: { wOCreate: txWOCreate, statusLogCreate: txStatusLogCreate } };
}

describe('InterventionService.submitClosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws ForbiddenException when actor is not the principal technician', async () => {
    const { service, repo } = buildMocks();
    repo.findById.mockResolvedValueOnce(
      buildWorkOrder({ principalTechnicianId: 'other-tech' }) as never,
    );

    await expect(
      service.submitClosure(WO_ID, {} as never, ACTOR_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequestException when pending mandatory checklist items remain', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderChecklistItem.count.mockResolvedValueOnce(2);

    await expect(
      service.submitClosure(WO_ID, {} as never, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transitions WO to PENDING_VALIDATION and notifies supervisors', async () => {
    const { service, repo, notifications, tx } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never).mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.PENDING_VALIDATION }) as never);

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);

    expect(tx.statusLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toStatus: WorkOrderStatus.PENDING_VALIDATION,
          actorId: ACTOR_ID,
        }),
      }),
    );
    expect(notifications.notifySupervisors).toHaveBeenCalledWith(
      'WO_PENDING_VALIDATION',
      expect.any(String),
      expect.any(String),
      'WorkOrder',
      WO_ID,
    );
  });

  it('creates corrective WOs for ANOMALY_DETECTED items with autoCreateCorrectiveWO at closure', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder({ sourcePlanId: 'plan-1' }) as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    const anomalyItem = buildChecklistItem({ id: 'item-anomaly', description: 'Pressure valve leaking' });
    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([anomalyItem] as never);

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);

    expect(tx.wOCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: WorkOrderType.CORRECTIVE,
          status: WorkOrderStatus.OPEN,
          sourceType: WorkOrderSource.CHECKLIST_ANOMALY,
          triggeredByChecklistItemId: 'item-anomaly',
          assetId: ASSET_ID,
          capturedLocationPath: LOCATION_PATH,
          createdById: ACTOR_ID,
        }),
      }),
    );
  });

  it('sets sourcePlanId on corrective WO when parent WO has one', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder({ sourcePlanId: 'plan-42' }) as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([
      buildChecklistItem(),
    ] as never);

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);

    expect(tx.wOCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourcePlanId: 'plan-42' }),
      }),
    );
  });

  it('does NOT set sourcePlanId when parent WO has none', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder({ sourcePlanId: null }) as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([
      buildChecklistItem(),
    ] as never);

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);

    const createCall = tx.wOCreate.mock.calls[0][0];
    expect(createCall.data.sourcePlanId).toBeUndefined();
  });

  it('creates one corrective WO per anomaly item', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder() as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([
      buildChecklistItem({ id: 'item-a', description: 'Bearing worn' }),
      buildChecklistItem({ id: 'item-b', description: 'Oil leak' }),
    ] as never);

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);

    expect(tx.wOCreate).toHaveBeenCalledTimes(2);
    const ids = tx.wOCreate.mock.calls.map((c: any[]) => c[0].data.triggeredByChecklistItemId);
    expect(ids).toContain('item-a');
    expect(ids).toContain('item-b');
  });

  it('does NOT create corrective WOs when no anomaly items have autoCreateCorrectiveWO', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder() as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([] as never);

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);

    expect(tx.wOCreate).not.toHaveBeenCalled();
  });

  it('computes activeDurationMinutes from elapsed time and never accepts a manual value', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder() as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    const elapsedMs = 60_000 * 45;
    const startedAt = new Date(Date.now() - elapsedMs);
    const expectedMinutes = 45;

    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const txWithLog = {
        workOrder: { create: jest.fn(), update: jest.fn() },
        workOrderStatusLog: { create: jest.fn() },
        interventionLog: {
          findFirst: jest.fn().mockResolvedValue({ id: 'log-1', startedAt }),
          update: jest.fn(),
        },
        interventionAction: { createMany: jest.fn() },
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      await cb(txWithLog);
      const updateCall = txWithLog.interventionLog.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'log-1' });
      expect(updateCall.data.endedAt).toBeInstanceOf(Date);
      expect(updateCall.data.activeDurationMinutes).toBeGreaterThanOrEqual(expectedMinutes - 1);
      expect(updateCall.data.activeDurationMinutes).toBeLessThanOrEqual(expectedMinutes + 1);
    });

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);
  });

  it('skips log update when no active intervention log is found', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder() as never)
      .mockResolvedValueOnce(buildWorkOrder() as never);

    let interventionUpdateCalled = false;
    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const txWithLog = {
        workOrder: { create: jest.fn(), update: jest.fn() },
        workOrderStatusLog: { create: jest.fn() },
        interventionLog: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockImplementation(() => { interventionUpdateCalled = true; }),
        },
        interventionAction: { createMany: jest.fn() },
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      await cb(txWithLog);
    });

    await service.submitClosure(WO_ID, { result: 'COMPLETED' } as never, ACTOR_ID);
    expect(interventionUpdateCalled).toBe(false);
  });
});
