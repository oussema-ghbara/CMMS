/**
 * Unit tests for WorkOrdersService.create — duplicate active WO guard.
 *
 * Business rule: if an asset already has a non-terminal work order,
 * the service MUST throw ConflictException unless forceCreate=true.
 *
 * Regression safety: the guard must NOT fire for terminal WOs (CLOSED/CANCELLED).
 */

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ReportGenerationService } from './report-generation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { AssetStatus, WorkOrderStatus, NotificationType } from '@gmao/db';
import {
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderType,
  WOCancellationReason,
} from '@gmao/shared';

const ASSET_ID = 'asset-1';
const ACTOR_ID = 'actor-1';

function baseDto(overrides: Record<string, unknown> = {}) {
  return {
    type: WorkOrderType.CORRECTIVE,
    priority: WorkOrderPriority.MEDIUM,
    description: 'Fix pump',
    assetId: ASSET_ID,
    forceCreate: false,
    ...overrides,
  };
}

function makeAsset(status: AssetStatus = AssetStatus.OPERATIONAL) {
  return {
    id: ASSET_ID,
    status,
    location: { id: 'loc-1', fullPath: 'Building A > Floor 1' },
  };
}

function makeExistingWo(status: WorkOrderStatus = WorkOrderStatus.IN_PROGRESS) {
  return {
    id: 'wo-existing',
    referenceNumber: 'WO-2026-001',
    status,
    type: WorkOrderType.CORRECTIVE as string,
  };
}

describe('WorkOrdersService.create', () => {
  let service: WorkOrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let repo: jest.Mocked<WorkOrdersRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'wo-new', referenceNumber: 'WO-2026-002' }),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            asset: { findUnique: jest.fn() },
            workOrder: { findFirst: jest.fn(), update: jest.fn() },
            workOrderStatusLog: { create: jest.fn() },
            assetStatusLog: { create: jest.fn() },
            workOrderAssignment: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    repo = module.get(WorkOrdersRepository) as jest.Mocked<WorkOrdersRepository>;
  });

  // ─── Decommissioned asset ─────────────────────────────────────────────────

  it('throws BadRequestException for decommissioned asset', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(
      makeAsset(AssetStatus.DECOMMISSIONED),
    );

    await expect(service.create(baseDto() as any, ACTOR_ID)).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when asset is not found', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.create(baseDto() as any, ACTOR_ID)).rejects.toThrow(BadRequestException);
  });

  // ─── Duplicate guard — forceCreate=false (default) ────────────────────────

  it('throws ConflictException with existing WO details when active WO exists', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(makeAsset());
    (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue(
      makeExistingWo(WorkOrderStatus.IN_PROGRESS),
    );

    const error = await service.create(baseDto({ forceCreate: false }) as any, ACTOR_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      message: 'workOrders.duplicateActiveWo',
      existingWorkOrder: {
        id: 'wo-existing',
        referenceNumber: 'WO-2026-001',
        status: WorkOrderStatus.IN_PROGRESS,
      },
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    WorkOrderStatus.DRAFT,
    WorkOrderStatus.OPEN,
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.ON_HOLD,
    WorkOrderStatus.PENDING_VALIDATION,
  ])('rejects when existing WO is in status %s', async (status: WorkOrderStatus) => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(makeAsset());
    (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue(makeExistingWo(status));

    await expect(service.create(baseDto() as any as any, ACTOR_ID)).rejects.toThrow(ConflictException);
  });

  // ─── Duplicate guard — forceCreate=true bypasses the check ────────────────

  it('creates WO when forceCreate=true even if active WO exists', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(makeAsset());

    await service.create(baseDto({ forceCreate: true }) as any, ACTOR_ID);

    expect(prisma.workOrder.findFirst).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: ASSET_ID }),
      ACTOR_ID,
      WorkOrderSource.DIRECT_CREATION,
      'Building A > Floor 1',
    );
  });

  // ─── No active WO — happy path ────────────────────────────────────────────

  it('creates WO when no active WO exists for the asset', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(makeAsset());
    (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue(null);

    const wo = await service.create(baseDto() as any, ACTOR_ID);

    expect(wo).toMatchObject({ referenceNumber: 'WO-2026-002' });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  // ─── Terminal WOs do NOT trigger the guard ─────────────────────────────────

  it('does not block creation when only terminal WOs exist (closed/cancelled)', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(makeAsset());
    // findFirst with active statuses returns null → no active WO
    (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue(null);

    await service.create(baseDto() as any, ACTOR_ID);

    // Verify the query was scoped to active statuses only (not terminal ones)
    expect(prisma.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.not.arrayContaining([WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED]) }),
        }),
      }),
    );
  });
});

describe('WorkOrdersService.cancel', () => {
  let service: WorkOrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let repo: jest.Mocked<WorkOrdersRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn().mockResolvedValue({ id: 'wo-1', status: WorkOrderStatus.CANCELLED }),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            asset: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
            workOrder: { findFirst: jest.fn(), update: jest.fn() },
            workOrderStatusLog: { create: jest.fn() },
            assetStatusLog: { create: jest.fn() },
            workOrderAssignment: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    repo = module.get(WorkOrdersRepository) as jest.Mocked<WorkOrdersRepository>;
  });

  it.each([
    WOCancellationReason.EXTERNAL_DECISION,
    WOCancellationReason.RESOLVED_OTHERWISE,
  ])('throws BadRequestException when %s is used without detail', async (reason) => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-010',
      status: WorkOrderStatus.OPEN,
    });

    await expect(service.cancel('wo-1', { reason } as any, ACTOR_ID)).rejects.toThrow(BadRequestException);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when required detail is whitespace-only', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-010',
      status: WorkOrderStatus.OPEN,
    });

    await expect(
      service.cancel('wo-1', {
        reason: WOCancellationReason.EXTERNAL_DECISION,
        detail: '   ',
      } as any, ACTOR_ID),
    ).rejects.toThrow(BadRequestException);

    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('allows cancellation without detail for reasons that do not require it', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-010',
      status: WorkOrderStatus.OPEN,
    });

    await service.cancel(
      'wo-1',
      { reason: WOCancellationReason.DUPLICATE } as any,
      ACTOR_ID,
    );

    expect(repo.updateStatus).toHaveBeenCalledWith(
      'wo-1',
      WorkOrderStatus.CANCELLED,
      ACTOR_ID,
      'Cancelled: DUPLICATE',
      expect.objectContaining({ cancellationReason: WOCancellationReason.DUPLICATE }),
    );
  });

  it('persists trimmed detail when reason requires detail', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-010',
      status: WorkOrderStatus.OPEN,
    });

    await service.cancel(
      'wo-1',
      {
        reason: WOCancellationReason.RESOLVED_OTHERWISE,
        detail: '  resolved by vendor patch  ',
      } as any,
      ACTOR_ID,
    );

    expect(repo.updateStatus).toHaveBeenCalledWith(
      'wo-1',
      WorkOrderStatus.CANCELLED,
      ACTOR_ID,
      'Cancelled: RESOLVED_OTHERWISE',
      expect.objectContaining({ cancellationDetail: 'resolved by vendor patch' }),
    );
    expect(prisma.workOrderAssignment.findMany).toHaveBeenCalledWith({
      where: { workOrderId: 'wo-1', isActive: true },
    });
  });

  // §9.4, §12.4: cancellation must notify the original requester when the WO
  // was created from a problem report.
  it('notifies source report requester on cancellation', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-020',
      status: WorkOrderStatus.OPEN,
      sourceReport: { reporter: { id: 'requester-42' } },
    });

    const notifications = service['notifications'] as jest.Mocked<NotificationsService>;

    await service.cancel('wo-1', { reason: WOCancellationReason.DUPLICATE } as any, ACTOR_ID);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'requester-42',
        type: NotificationType.LINKED_WO_CLOSED,
        entityType: 'WorkOrder',
        entityId: 'wo-1',
      }),
    );
  });

  it('does NOT send requester notification when WO has no source report', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-021',
      status: WorkOrderStatus.OPEN,
      sourceReport: null,
    });

    const notifications = service['notifications'] as jest.Mocked<NotificationsService>;

    await service.cancel('wo-1', { reason: WOCancellationReason.DUPLICATE } as any, ACTOR_ID);

    const linkedWoCalls = (notifications.notify as jest.Mock).mock.calls.filter(
      ([arg]: [{ type: string }]) => arg?.type === NotificationType.LINKED_WO_CLOSED,
    );
    expect(linkedWoCalls).toHaveLength(0);
  });

  it('does NOT send requester notification when sourceReport has no reporter', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'wo-1',
      assetId: 'asset-1',
      referenceNumber: 'WO-2026-022',
      status: WorkOrderStatus.OPEN,
      sourceReport: { reporter: null },
    });

    const notifications = service['notifications'] as jest.Mocked<NotificationsService>;

    await service.cancel('wo-1', { reason: WOCancellationReason.DUPLICATE } as any, ACTOR_ID);

    const linkedWoCalls = (notifications.notify as jest.Mock).mock.calls.filter(
      ([arg]: [{ type: string }]) => arg?.type === NotificationType.LINKED_WO_CLOSED,
    );
    expect(linkedWoCalls).toHaveLength(0);
  });

});

describe('WorkOrdersService.getAnalytics', () => {
  let service: WorkOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            workOrder: {
              groupBy: jest.fn(),
              count: jest.fn(),
              findMany: jest.fn(),
            },
            problemReport: { findMany: jest.fn() },
            workOrderChecklistItem: { findMany: jest.fn() },
            workOrderValidation: { groupBy: jest.fn() },
            workOrderReassignment: { count: jest.fn() },
            systemConfig: { findUnique: jest.fn() },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
  });

  it('returns analytics with a computed cost summary', async () => {
    const prisma = service['prisma'] as any;

    prisma.workOrder.groupBy
      .mockResolvedValueOnce([
        { status: WorkOrderStatus.OPEN, _count: { id: 1 } },
        { status: WorkOrderStatus.CLOSED, _count: { id: 2 } },
      ])
      .mockResolvedValueOnce([{ type: WorkOrderType.CORRECTIVE, _count: { id: 3 } }])
      .mockResolvedValueOnce([{ priority: WorkOrderPriority.HIGH, _count: { id: 3 } }])
      .mockResolvedValueOnce([]); // sourceDistRaw
    prisma.workOrder.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    prisma.workOrder.findMany
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-04-01T00:00:00Z'),
          closedAt: new Date('2026-04-03T00:00:00Z'),
        },
        {
          createdAt: new Date('2026-04-04T00:00:00Z'),
          closedAt: new Date('2026-04-06T00:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          assetId: 'a1',
          asset: { name: 'Pump A' },
          contractorCost: '120.00',
          interventionLogs: [
            { activeDurationMinutes: 120, hourlyRateAtTime: '50.00' },
            { activeDurationMinutes: null, hourlyRateAtTime: '40.00' },
          ],
          stockMovements: [
            { type: 'OUTGOING', quantity: 3, unitCostAtTime: '10.00' },
          ],
        },
        {
          assetId: 'a2',
          asset: { name: 'Motor B' },
          contractorCost: '0.00',
          interventionLogs: [
            { activeDurationMinutes: 30, hourlyRateAtTime: '80.00' },
          ],
          stockMovements: [
            { type: 'OUTGOING', quantity: 2, unitCostAtTime: '5.00' },
          ],
        },
      ])
      .mockResolvedValueOnce([]) // correctiveWOs (MTBF/MTTR)
      .mockResolvedValueOnce([]) // techKpiWOs
      .mockResolvedValueOnce([]); // preventiveWOsInPeriod
    prisma.problemReport.findMany.mockResolvedValueOnce([]);
    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([]);
    prisma.workOrderValidation.groupBy.mockResolvedValueOnce([]);
    prisma.workOrderReassignment.count.mockResolvedValueOnce(0);
    prisma.systemConfig.findUnique.mockResolvedValueOnce(null);

    const analytics = await service.getAnalytics(30);

    expect(analytics.summary).toMatchObject({
      total: 4,
      open: 1,
      overdue: 1,
      closedThisPeriod: 1,
      cancelledThisPeriod: 0,
      resolutionRate: 1,
    });
    expect(analytics.avgResolutionDays).toBe(2);
    expect(analytics.costSummary).toEqual({
      contractorCost: 120,
      laborCost: 140,
      partsCost: 40,
      totalCost: 300,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.getAnalytics — perAsset breakdown (§1.4 / §2.7)
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkOrdersService.getAnalytics — assetKpis.perAsset', () => {
  let service: WorkOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(),
            findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            workOrder: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
            problemReport: { findMany: jest.fn() },
            workOrderChecklistItem: { findMany: jest.fn() },
            workOrderValidation: { groupBy: jest.fn() },
            workOrderReassignment: { count: jest.fn() },
            systemConfig: { findUnique: jest.fn() },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        { provide: PartRequestsService, useValue: { handleWorkOrderCancellation: jest.fn() } },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorkOrdersService);
  });

  function setupMinimalMocks(prisma: any, correctiveWOs: any[], costWOs: any[]) {
    prisma.workOrder.groupBy
      .mockResolvedValueOnce([{ status: WorkOrderStatus.OPEN, _count: { id: 1 } }])
      .mockResolvedValueOnce([{ type: WorkOrderType.CORRECTIVE, _count: { id: 1 } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.workOrder.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prisma.workOrder.findMany
      .mockResolvedValueOnce([])    // closedWOs
      .mockResolvedValueOnce(costWOs)
      .mockResolvedValueOnce(correctiveWOs)
      .mockResolvedValueOnce([])    // techKpiWOs
      .mockResolvedValueOnce([]);   // preventiveWOsInPeriod
    prisma.problemReport.findMany.mockResolvedValueOnce([]);
    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([]);
    prisma.workOrderValidation.groupBy.mockResolvedValueOnce([]);
    prisma.workOrderReassignment.count.mockResolvedValueOnce(0);
    prisma.systemConfig.findUnique.mockResolvedValueOnce(null);
  }

  it('returns empty perAsset when no corrective WOs or cost data exist', async () => {
    const prisma = service['prisma'] as any;
    setupMinimalMocks(prisma, [], []);

    const result = await service.getAnalytics(30);

    expect(result.assetKpis.perAsset).toEqual([]);
  });

  it('computes downtimeHours as sum of WO duration for corrective WOs closed within the period', async () => {
    const prisma = service['prisma'] as any;
    const now = new Date();
    const recentClose = new Date(now.getTime() - 2 * 86_400_000); // 2 days ago — within 30-day period
    const openedAt = new Date(recentClose.getTime() - 4 * 3_600_000); // 4h before close

    const correctiveWOs = [
      {
        assetId: 'a1',
        asset: { name: 'Pump A' },
        createdAt: openedAt,
        closedAt: recentClose,
      },
    ];
    setupMinimalMocks(prisma, correctiveWOs, []);

    const result = await service.getAnalytics(30);

    const entry = result.assetKpis.perAsset.find((p) => p.assetId === 'a1');
    expect(entry).toBeDefined();
    expect(entry!.downtimeHours).toBe(4);
    expect(entry!.failureCount).toBe(1); // createdAt is within the 30-day period so it counts
  });

  it('computes mttrHours as mean repair time across all corrective WOs for that asset', async () => {
    const prisma = service['prisma'] as any;
    const now = new Date();
    const wo1Close = new Date(now.getTime() - 1 * 86_400_000);
    const wo1Open = new Date(wo1Close.getTime() - 2 * 3_600_000); // 2h
    const wo2Close = new Date(now.getTime() - 5 * 86_400_000);
    const wo2Open = new Date(wo2Close.getTime() - 4 * 3_600_000); // 4h

    const correctiveWOs = [
      { assetId: 'a1', asset: { name: 'Motor B' }, createdAt: wo1Open, closedAt: wo1Close },
      { assetId: 'a1', asset: { name: 'Motor B' }, createdAt: wo2Open, closedAt: wo2Close },
    ];
    setupMinimalMocks(prisma, correctiveWOs, []);

    const result = await service.getAnalytics(30);

    const entry = result.assetKpis.perAsset.find((p) => p.assetId === 'a1');
    expect(entry).toBeDefined();
    expect(entry!.mttrHours).toBe(3); // mean of [2, 4]
  });

  it('computes mtbfDays as mean gap between consecutive corrective WOs', async () => {
    const prisma = service['prisma'] as any;
    const now = new Date();
    // Both WOs within the 30-day period so the asset appears in perAsset
    const wo1Open = new Date(now.getTime() - 20 * 86_400_000);
    const wo1Close = new Date(now.getTime() - 19 * 86_400_000); // 1-day WO
    const wo2Open = new Date(now.getTime() - 14 * 86_400_000);  // gap = 5 days from wo1Close
    const wo2Close = new Date(now.getTime() - 13 * 86_400_000);

    const correctiveWOs = [
      { assetId: 'a1', asset: { name: 'Pump' }, createdAt: wo1Open, closedAt: wo1Close },
      { assetId: 'a1', asset: { name: 'Pump' }, createdAt: wo2Open, closedAt: wo2Close },
    ];
    setupMinimalMocks(prisma, correctiveWOs, []);

    const result = await service.getAnalytics(30);

    const entry = result.assetKpis.perAsset.find((p) => p.assetId === 'a1');
    expect(entry).toBeDefined();
    expect(entry!.mtbfDays).toBe(5);
  });

  it('includes total cost from costByAsset in perAsset entry', async () => {
    const prisma = service['prisma'] as any;
    const close = new Date();
    const open = new Date(close.getTime() - 3_600_000);

    const correctiveWOs = [
      { assetId: 'a1', asset: { name: 'Asset A' }, createdAt: open, closedAt: close },
    ];
    const costWOs = [
      {
        assetId: 'a1',
        asset: { name: 'Asset A' },
        contractorCost: '0',
        interventionLogs: [{ activeDurationMinutes: 60, hourlyRateAtTime: '100' }],
        stockMovements: [{ type: 'OUTGOING', quantity: 2, unitCostAtTime: '50' }],
      },
    ];
    setupMinimalMocks(prisma, correctiveWOs, costWOs);

    const result = await service.getAnalytics(30);

    const entry = result.assetKpis.perAsset.find((p) => p.assetId === 'a1');
    expect(entry).toBeDefined();
    expect(entry!.partsCost).toBe(100);
    expect(entry!.totalCost).toBe(200); // 100 labor + 100 parts
  });

  it('includes assets that appear only in costWOs (no corrective failures)', async () => {
    const prisma = service['prisma'] as any;
    const costWOs = [
      {
        assetId: 'a2',
        asset: { name: 'Asset B' },
        contractorCost: '50',
        interventionLogs: [],
        stockMovements: [],
      },
    ];
    setupMinimalMocks(prisma, [], costWOs);

    const result = await service.getAnalytics(30);

    const entry = result.assetKpis.perAsset.find((p) => p.assetId === 'a2');
    expect(entry).toBeDefined();
    expect(entry!.failureCount).toBe(0);
    expect(entry!.downtimeHours).toBe(0);
    expect(entry!.totalCost).toBe(50);
  });

  it('passes categoryId to the backend query filter and returns it in the response', async () => {
    const prisma = service['prisma'] as any;
    setupMinimalMocks(prisma, [], []);

    const result = await service.getAnalytics(30, 'cat-abc');

    expect(result.categoryId).toBe('cat-abc');
    const countCall = prisma.workOrder.count.mock.calls[2];
    expect(countCall[0]).toMatchObject({ where: expect.objectContaining({ asset: { categoryId: 'cat-abc' } }) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.getAnalytics — technician rejection rate by category (§9.8)
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkOrdersService.getAnalytics — technicianKpis.rejectionRateByCategory', () => {
  let service: WorkOrdersService;

  const TECH_ID = 'tech-1';
  const TECH_NAME = 'Alice';

  function buildTechKpiWO(validationActions: Array<{ action: string; rejectionReason: string | null }>) {
    return {
      principalTechnicianId: TECH_ID,
      principalTechnician: { id: TECH_ID, name: TECH_NAME },
      createdAt: new Date('2026-04-01T08:00:00Z'),
      validationActions,
      onHoldPeriods: [],
      interventionLogs: [],
    };
  }

  function setupMocks(prisma: any, techKpiWOs: unknown[]) {
    prisma.workOrder.groupBy
      .mockResolvedValueOnce([]) // byStatus
      .mockResolvedValueOnce([]) // byType
      .mockResolvedValueOnce([]) // byPriority
      .mockResolvedValueOnce([]); // sourceDistRaw
    prisma.workOrder.count
      .mockResolvedValue(0);
    prisma.workOrder.findMany
      .mockResolvedValueOnce([]) // closedWOs (resolution days)
      .mockResolvedValueOnce([]) // costWOs
      .mockResolvedValueOnce([]) // correctiveWOs (MTBF/MTTR)
      .mockResolvedValueOnce(techKpiWOs) // techKpiWOs
      .mockResolvedValueOnce([]); // preventiveWOsInPeriod
    prisma.problemReport.findMany.mockResolvedValueOnce([]);
    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([]);
    prisma.workOrderValidation.groupBy.mockResolvedValueOnce([]);
    prisma.workOrderReassignment.count.mockResolvedValueOnce(0);
    prisma.systemConfig.findUnique.mockResolvedValueOnce(null);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(),
            findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            workOrder: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
            problemReport: { findMany: jest.fn() },
            workOrderChecklistItem: { findMany: jest.fn() },
            workOrderValidation: { groupBy: jest.fn() },
            workOrderReassignment: { count: jest.fn() },
            systemConfig: { findUnique: jest.fn() },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorkOrdersService);
  });

  it('computes rejectionCount=0 and empty rejectionRateByCategory when no rejections', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildTechKpiWO([{ action: 'VALIDATED', rejectionReason: null }]),
    ]);

    const result = await service.getAnalytics(30);
    const tech = result.technicianKpis[0];

    expect(tech.technicianId).toBe(TECH_ID);
    expect(tech.closedCount).toBe(1);
    expect(tech.rejectionCount).toBe(0);
    expect(tech.rejectionRate).toBe(0);
    expect(tech.rejectionRateByCategory).toEqual({});
  });

  it('computes rejectionRate and breakdown for a single rejection reason', async () => {
    const prisma = service['prisma'] as any;
    // 2 WOs: one rejected with INCONSISTENT_TIME, one accepted
    setupMocks(prisma, [
      buildTechKpiWO([
        { action: 'REJECTED', rejectionReason: 'INCONSISTENT_TIME' },
        { action: 'VALIDATED', rejectionReason: null },
      ]),
      buildTechKpiWO([{ action: 'VALIDATED', rejectionReason: null }]),
    ]);

    const result = await service.getAnalytics(30);
    const tech = result.technicianKpis[0];

    expect(tech.closedCount).toBe(2);
    expect(tech.rejectionCount).toBe(1);
    // 1 rejection action / 2 WOs = 0.5 → stored as 0.5 (rounded to 3dp)
    expect(tech.rejectionRate).toBe(0.5);
    expect(tech.rejectionRateByCategory).toEqual({
      INCONSISTENT_TIME: { count: 1, rate: 0.5 },
    });
  });

  it('accumulates multiple rejection reasons across WOs for the same technician', async () => {
    const prisma = service['prisma'] as any;
    // 4 WOs: 3 rejected with different/same reasons, 1 accepted
    setupMocks(prisma, [
      buildTechKpiWO([{ action: 'REJECTED', rejectionReason: 'INSUFFICIENT_DESCRIPTION' }]),
      buildTechKpiWO([{ action: 'REJECTED', rejectionReason: 'PARTS_USED_MISMATCH' }]),
      buildTechKpiWO([{ action: 'REJECTED', rejectionReason: 'INSUFFICIENT_DESCRIPTION' }]),
      buildTechKpiWO([{ action: 'VALIDATED', rejectionReason: null }]),
    ]);

    const result = await service.getAnalytics(30);
    const tech = result.technicianKpis[0];

    expect(tech.closedCount).toBe(4);
    expect(tech.rejectionCount).toBe(3);
    expect(tech.rejectionRate).toBe(0.75); // 3/4
    expect(tech.rejectionRateByCategory['INSUFFICIENT_DESCRIPTION']).toEqual({
      count: 2,
      rate: 0.5, // 2/4
    });
    expect(tech.rejectionRateByCategory['PARTS_USED_MISMATCH']).toEqual({
      count: 1,
      rate: 0.25, // 1/4
    });
  });

  it('tracks rejection reasons independently per technician when multiple techs exist', async () => {
    const TECH2_ID = 'tech-2';
    const TECH2_NAME = 'Bob';
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      // Alice: 1 rejection
      {
        principalTechnicianId: TECH_ID,
        principalTechnician: { id: TECH_ID, name: TECH_NAME },
        createdAt: new Date('2026-04-01T08:00:00Z'),
        validationActions: [{ action: 'REJECTED', rejectionReason: 'INCOMPLETE_CHECKLIST' }],
        onHoldPeriods: [],
        interventionLogs: [],
      },
      // Bob: 0 rejections
      {
        principalTechnicianId: TECH2_ID,
        principalTechnician: { id: TECH2_ID, name: TECH2_NAME },
        createdAt: new Date('2026-04-02T08:00:00Z'),
        validationActions: [{ action: 'VALIDATED', rejectionReason: null }],
        onHoldPeriods: [],
        interventionLogs: [],
      },
    ]);

    const result = await service.getAnalytics(30);
    const alice = result.technicianKpis.find((t) => t.technicianId === TECH_ID)!;
    const bob = result.technicianKpis.find((t) => t.technicianId === TECH2_ID)!;

    expect(alice.rejectionCount).toBe(1);
    expect(alice.rejectionRateByCategory).toEqual({
      INCOMPLETE_CHECKLIST: { count: 1, rate: 1 },
    });
    expect(bob.rejectionCount).toBe(0);
    expect(bob.rejectionRateByCategory).toEqual({});
  });

  it('handles null rejectionReason on REJECTED actions gracefully', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildTechKpiWO([{ action: 'REJECTED', rejectionReason: null }]),
    ]);

    const result = await service.getAnalytics(30);
    const tech = result.technicianKpis[0];

    // null reason is skipped — rejectionCount stays 0, category map stays empty
    expect(tech.rejectionCount).toBe(0);
    expect(tech.rejectionRateByCategory).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.createFollowUp
// ─────────────────────────────────────────────────────────────────────────────

describe('WorkOrdersService.createFollowUp', () => {
  let service: WorkOrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let repo: jest.Mocked<WorkOrdersRepository>;

  const ORIGINAL_WO_ID = 'wo-closed-1';
  const ACTOR_ID = 'supervisor-1';

  const closedWo = {
    id: ORIGINAL_WO_ID,
    referenceNumber: 'WO-2026-100',
    status: WorkOrderStatus.CLOSED,
    assetId: 'asset-99',
    type: WorkOrderType.CORRECTIVE,
    priority: WorkOrderPriority.HIGH,
    description: 'Pump failure',
  };

  const followUpDto = {
    type: WorkOrderType.CORRECTIVE,
    priority: WorkOrderPriority.HIGH,
    description: 'Suite à WO-2026-100 : Pump failure',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({
              id: 'wo-follow-1',
              referenceNumber: 'WO-2026-101',
              status: WorkOrderStatus.DRAFT,
            }),
            findById: jest.fn().mockResolvedValue(closedWo),
            findAll: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            asset: {
              findUnique: jest.fn(),
              findUniqueOrThrow: jest.fn().mockResolvedValue({
                id: 'asset-99',
                location: { fullPath: 'Site A > Hall 2' },
              }),
            },
            workOrder: { findFirst: jest.fn() },
            workOrderAssignment: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    repo = module.get(WorkOrdersRepository) as jest.Mocked<WorkOrdersRepository>;
  });

  it('creates a follow-up WO in DRAFT with FOLLOW_UP source and followUpFromId', async () => {
    const result = await service.createFollowUp(ORIGINAL_WO_ID, followUpDto as any, ACTOR_ID);

    expect(result.referenceNumber).toBe('WO-2026-101');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkOrderType.CORRECTIVE,
        description: followUpDto.description,
        assetId: 'asset-99',
      }),
      ACTOR_ID,
      WorkOrderSource.FOLLOW_UP,
      'Site A > Hall 2',
      undefined,
      undefined,
      ORIGINAL_WO_ID,
    );
  });

  it('throws BadRequestException when original WO is not CLOSED', async () => {
    (repo.findById as jest.Mock).mockResolvedValue({
      ...closedWo,
      status: WorkOrderStatus.IN_PROGRESS,
    });

    await expect(
      service.createFollowUp(ORIGINAL_WO_ID, followUpDto as any, ACTOR_ID),
    ).rejects.toThrow(BadRequestException);

    expect(repo.create).not.toHaveBeenCalled();
  });

  it('uses the original WO assetId (not caller-supplied)', async () => {
    await service.createFollowUp(ORIGINAL_WO_ID, followUpDto as any, ACTOR_ID);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-99' }),
      expect.anything(),
      WorkOrderSource.FOLLOW_UP,
      expect.anything(),
      undefined,
      undefined,
      ORIGINAL_WO_ID,
    );
  });

  it('throws when findUniqueOrThrow rejects (asset deleted)', async () => {
    (prisma.asset.findUniqueOrThrow as jest.Mock).mockRejectedValue(new Error('Not found'));

    await expect(
      service.createFollowUp(ORIGINAL_WO_ID, followUpDto as any, ACTOR_ID),
    ).rejects.toThrow('Not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.getTechnicianLoad
// ─────────────────────────────────────────────────────────────────────────────

describe('WorkOrdersService.getTechnicianLoad', () => {
  let service: WorkOrdersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            asset: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
            workOrder: { findFirst: jest.fn() },
            workOrderAssignment: { findMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  it('returns empty array when no active assignments exist', async () => {
    (prisma.workOrderAssignment.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getTechnicianLoad();

    expect(result).toEqual([]);
  });

  it('aggregates open WO count per technician and detects CRITICAL', async () => {
    (prisma.workOrderAssignment.findMany as jest.Mock).mockResolvedValue([
      {
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Alice' },
        workOrder: { priority: WorkOrderPriority.CRITICAL },
      },
      {
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Alice' },
        workOrder: { priority: WorkOrderPriority.MEDIUM },
      },
      {
        technicianId: 'tech-2',
        technician: { id: 'tech-2', name: 'Bob' },
        workOrder: { priority: WorkOrderPriority.LOW },
      },
    ]);

    const result = await service.getTechnicianLoad();

    expect(result).toHaveLength(2);
    const alice = result.find((r) => r.technicianId === 'tech-1')!;
    expect(alice.openWoCount).toBe(2);
    expect(alice.hasCritical).toBe(true);

    const bob = result.find((r) => r.technicianId === 'tech-2')!;
    expect(bob.openWoCount).toBe(1);
    expect(bob.hasCritical).toBe(false);
  });

  it('returns results sorted by openWoCount descending', async () => {
    (prisma.workOrderAssignment.findMany as jest.Mock).mockResolvedValue([
      {
        technicianId: 'tech-a',
        technician: { id: 'tech-a', name: 'Charlie' },
        workOrder: { priority: WorkOrderPriority.LOW },
      },
      {
        technicianId: 'tech-b',
        technician: { id: 'tech-b', name: 'Dave' },
        workOrder: { priority: WorkOrderPriority.LOW },
      },
      {
        technicianId: 'tech-b',
        technician: { id: 'tech-b', name: 'Dave' },
        workOrder: { priority: WorkOrderPriority.HIGH },
      },
    ]);

    const result = await service.getTechnicianLoad();

    expect(result[0].technicianId).toBe('tech-b');
    expect(result[0].openWoCount).toBe(2);
    expect(result[1].technicianId).toBe('tech-a');
    expect(result[1].openWoCount).toBe(1);
  });

  it('hasCritical is false when no WO has CRITICAL priority', async () => {
    (prisma.workOrderAssignment.findMany as jest.Mock).mockResolvedValue([
      {
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Eve' },
        workOrder: { priority: WorkOrderPriority.HIGH },
      },
    ]);

    const result = await service.getTechnicianLoad();

    expect(result[0].hasCritical).toBe(false);
  });

  it('queries only non-terminal work orders', async () => {
    (prisma.workOrderAssignment.findMany as jest.Mock).mockResolvedValue([]);

    await service.getTechnicianLoad();

    expect(prisma.workOrderAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          workOrder: expect.objectContaining({
            status: expect.objectContaining({
              notIn: expect.arrayContaining([
                WorkOrderStatus.CLOSED,
                WorkOrderStatus.CANCELLED,
              ]),
            }),
          }),
        }),
      }),
    );
  });
});

// ─── getDurationHints ────────────────────────────────────────────────────────

describe('WorkOrdersService.getDurationHints', () => {
  let service: WorkOrdersService;
  let prisma: { asset: { findUnique: jest.Mock }; workOrder: { findMany: jest.Mock } };

  function makeWo(durationDays: number): { createdAt: Date; closedAt: Date } {
    const base = new Date('2026-01-01T12:00:00Z');
    return {
      createdAt: new Date(base.getTime() - durationDays * 24 * 60 * 60 * 1000),
      closedAt: new Date(base.getTime()),
    };
  }

  beforeEach(async () => {
    prisma = {
      asset: { findUnique: jest.fn() },
      workOrder: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: { create: jest.fn(), findAll: jest.fn(), findById: jest.fn(), updateStatus: jest.fn(), updatePriority: jest.fn(), findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() } },
        { provide: PartRequestsService, useValue: { handleWorkOrderCancellation: jest.fn() } },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
  });

  it('returns all null when no closed WOs exist', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ categoryId: 'cat-1' });
    (prisma.workOrder.findMany as jest.Mock).mockResolvedValue([]);
    const result = await service.getDurationHints('asset-1', WorkOrderType.CORRECTIVE);
    expect(result).toEqual({ last5AssetAvgDays: null, categoryAvgDays: null, technicianAvgDays: null });
  });

  it('computes last5AssetAvgDays from two WOs of 10 days each', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ categoryId: null });
    (prisma.workOrder.findMany as jest.Mock)
      .mockResolvedValueOnce([makeWo(10), makeWo(10)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await service.getDurationHints('asset-1', WorkOrderType.CORRECTIVE);
    expect(result.last5AssetAvgDays).toBe(10);
  });

  it('returns technicianAvgDays when technicianId is provided', async () => {
    // categoryId is null → category query uses Promise.resolve([]), NOT findMany
    // So findMany is called only twice: asset WOs + technician WOs
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ categoryId: null });
    (prisma.workOrder.findMany as jest.Mock)
      .mockResolvedValueOnce([])        // asset WOs
      .mockResolvedValueOnce([makeWo(15)]); // technician WOs
    const result = await service.getDurationHints('asset-1', WorkOrderType.CORRECTIVE, 'tech-1');
    expect(result.technicianAvgDays).toBe(15);
  });

  it('returns null technicianAvgDays when no technicianId is provided', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ categoryId: null });
    (prisma.workOrder.findMany as jest.Mock).mockResolvedValue([]);
    const result = await service.getDurationHints('asset-1', WorkOrderType.CORRECTIVE);
    expect(result.technicianAvgDays).toBeNull();
  });

  it('queries asset category when categoryId is set', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ categoryId: 'cat-2' });
    (prisma.workOrder.findMany as jest.Mock).mockResolvedValue([]);
    await service.getDurationHints('asset-1', WorkOrderType.CORRECTIVE);
    const categoryCall = (prisma.workOrder.findMany as jest.Mock).mock.calls[1];
    expect(categoryCall[0].where.asset).toEqual({ categoryId: 'cat-2' });
  });

  it('rounds average to 1 decimal place', async () => {
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ categoryId: null });
    const totalMs = 7.333 * 24 * 60 * 60 * 1000;
    (prisma.workOrder.findMany as jest.Mock)
      .mockResolvedValueOnce([{ createdAt: new Date(0), closedAt: new Date(totalMs) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await service.getDurationHints('asset-1', WorkOrderType.CORRECTIVE);
    expect(result.last5AssetAvgDays).toBe(7.3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.getRecurringFailureAssets
// ─────────────────────────────────────────────────────────────────────────────

describe('WorkOrdersService.getRecurringFailureAssets', () => {
  let service: WorkOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(), findAll: jest.fn(), findById: jest.fn(),
            updateStatus: jest.fn(), updatePriority: jest.fn(), findOverdueForEscalation: jest.fn(), findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            workOrder: { findMany: jest.fn() },
            problemReport: { findMany: jest.fn() },
            workOrderChecklistItem: { findMany: jest.fn() },
            workOrderValidation: { groupBy: jest.fn() },
            workOrderReassignment: { count: jest.fn() },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
  });

  it('returns empty array when no assets have corrective WOs', async () => {
    const prisma = service['prisma'] as any;
    prisma.workOrder.findMany.mockResolvedValueOnce([]);

    const result = await service.getRecurringFailureAssets(3, 90);

    expect(result).toHaveLength(0);
  });

  it('returns asset when corrective WO count meets threshold', async () => {
    const prisma = service['prisma'] as any;
    const date = new Date('2026-04-01');
    prisma.workOrder.findMany.mockResolvedValueOnce([
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
    ]);

    const result = await service.getRecurringFailureAssets(3, 90);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assetId: 'a1', assetName: 'Pump A', failureCount: 3 });
  });

  it('excludes asset when count is below threshold', async () => {
    const prisma = service['prisma'] as any;
    const date = new Date('2026-04-01');
    prisma.workOrder.findMany.mockResolvedValueOnce([
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
    ]);

    const result = await service.getRecurringFailureAssets(3, 90);

    expect(result).toHaveLength(0);
  });

  it('sorts results descending by failure count', async () => {
    const prisma = service['prisma'] as any;
    const date = new Date('2026-04-01');
    const wos = [
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
      { assetId: 'a1', asset: { name: 'Pump A', qrCodeIdentifier: 'QR-001' }, createdAt: date },
      { assetId: 'a2', asset: { name: 'Motor B', qrCodeIdentifier: 'QR-002' }, createdAt: date },
      { assetId: 'a2', asset: { name: 'Motor B', qrCodeIdentifier: 'QR-002' }, createdAt: date },
      { assetId: 'a2', asset: { name: 'Motor B', qrCodeIdentifier: 'QR-002' }, createdAt: date },
      { assetId: 'a2', asset: { name: 'Motor B', qrCodeIdentifier: 'QR-002' }, createdAt: date },
      { assetId: 'a2', asset: { name: 'Motor B', qrCodeIdentifier: 'QR-002' }, createdAt: date },
    ];
    prisma.workOrder.findMany.mockResolvedValueOnce(wos);

    const result = await service.getRecurringFailureAssets(3, 90);

    expect(result).toHaveLength(2);
    expect(result[0].failureCount).toBeGreaterThanOrEqual(result[1].failureCount);
    expect(result[0].assetId).toBe('a2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.getAnalytics — requesterAnalytics KPIs (§9.8)
//   • reportAccuracyRate  – % of closed converted reports resolved with RESOLVED
//   • duplicateSubmissionRate – % of reports where submittedDespiteWarning=true
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkOrdersService.getAnalytics — requesterAnalytics §9.8', () => {
  let service: WorkOrdersService;

  function buildReport(overrides: {
    derivedWorkOrders?: Array<{ id: string; status: string; interventionLogs: Array<{ result: string | null }> }>;
    submittedDespiteWarning?: boolean;
    processedAt?: Date | null;
  } = {}) {
    return {
      status: 'PENDING',
      processedAt: overrides.processedAt ?? null,
      createdAt: new Date('2026-04-01T08:00:00Z'),
      submittedDespiteWarning: overrides.submittedDespiteWarning ?? false,
      derivedWorkOrders: overrides.derivedWorkOrders ?? [],
    };
  }

  function setupMocks(prisma: any, reports: unknown[]) {
    prisma.workOrder.groupBy
      .mockResolvedValueOnce([]) // byStatus
      .mockResolvedValueOnce([]) // byType
      .mockResolvedValueOnce([]) // byPriority
      .mockResolvedValueOnce([]); // sourceDistRaw
    prisma.workOrder.count.mockResolvedValue(0);
    prisma.workOrder.findMany
      .mockResolvedValueOnce([]) // closedWOs
      .mockResolvedValueOnce([]) // costWOs
      .mockResolvedValueOnce([]) // correctiveWOs
      .mockResolvedValueOnce([]) // techKpiWOs
      .mockResolvedValueOnce([]); // preventiveWOsInPeriod
    prisma.problemReport.findMany.mockResolvedValueOnce(reports);
    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([]);
    prisma.workOrderValidation.groupBy.mockResolvedValueOnce([]);
    prisma.workOrderReassignment.count.mockResolvedValueOnce(0);
    prisma.systemConfig.findUnique.mockResolvedValueOnce(null);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(),
            findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            workOrder: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
            problemReport: { findMany: jest.fn() },
            workOrderChecklistItem: { findMany: jest.fn() },
            workOrderValidation: { groupBy: jest.fn() },
            workOrderReassignment: { count: jest.fn() },
            systemConfig: { findUnique: jest.fn() },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorkOrdersService);
  });

  // ── reportAccuracyRate ──────────────────────────────────────────────────────

  it('returns null reportAccuracyRate when there are no closed converted reports', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      // Converted but WO still open — not yet a closed conversion
      buildReport({
        derivedWorkOrders: [{ id: 'wo-1', status: 'IN_PROGRESS', interventionLogs: [] }],
      }),
    ]);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.reportAccuracyRate).toBeNull();
  });

  it('computes reportAccuracyRate=1 when all closed conversions have RESOLVED result', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-1', status: 'CLOSED', interventionLogs: [{ result: 'RESOLVED' }] },
        ],
      }),
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-2', status: 'CLOSED', interventionLogs: [{ result: 'RESOLVED' }] },
        ],
      }),
    ]);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.reportAccuracyRate).toBe(1);
  });

  it('computes reportAccuracyRate=0.5 when half of closed conversions are RESOLVED', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      // Report 1: closed with RESOLVED
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-1', status: 'CLOSED', interventionLogs: [{ result: 'RESOLVED' }] },
        ],
      }),
      // Report 2: closed with PARTIALLY_RESOLVED (not RESOLVED)
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-2', status: 'CLOSED', interventionLogs: [{ result: 'PARTIALLY_RESOLVED' }] },
        ],
      }),
    ]);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.reportAccuracyRate).toBe(0.5);
  });

  it('computes reportAccuracyRate=0 when all closed conversions have non-RESOLVED result', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-1', status: 'CLOSED', interventionLogs: [{ result: 'COULD_NOT_INTERVENE' }] },
        ],
      }),
    ]);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.reportAccuracyRate).toBe(0);
  });

  it('counts only CLOSED derived WOs for accuracy denominator (ignores open/in-progress)', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      // Report has both an open and a closed WO; only the closed one counts
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-open', status: 'IN_PROGRESS', interventionLogs: [] },
          { id: 'wo-closed', status: 'CLOSED', interventionLogs: [{ result: 'RESOLVED' }] },
        ],
      }),
    ]);

    const result = await service.getAnalytics(30);

    // 1 closed conversion with RESOLVED → 1/1 = 1
    expect(result.requesterAnalytics.reportAccuracyRate).toBe(1);
  });

  // ── duplicateSubmissionRate ─────────────────────────────────────────────────

  it('returns null duplicateSubmissionRate when there are no reports', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, []);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.duplicateSubmissionRate).toBeNull();
  });

  it('computes duplicateSubmissionRate=0 when no report was submitted despite warning', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildReport({ submittedDespiteWarning: false }),
      buildReport({ submittedDespiteWarning: false }),
    ]);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.duplicateSubmissionRate).toBe(0);
  });

  it('computes duplicateSubmissionRate=0.5 when half of reports had submittedDespiteWarning', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildReport({ submittedDespiteWarning: true }),
      buildReport({ submittedDespiteWarning: false }),
    ]);

    const result = await service.getAnalytics(30);

    // 1 with warning / 2 total = 0.5
    expect(result.requesterAnalytics.duplicateSubmissionRate).toBe(0.5);
  });

  it('computes duplicateSubmissionRate=1 when all reports had submittedDespiteWarning', async () => {
    const prisma = service['prisma'] as any;
    setupMocks(prisma, [
      buildReport({ submittedDespiteWarning: true }),
      buildReport({ submittedDespiteWarning: true }),
      buildReport({ submittedDespiteWarning: true }),
    ]);

    const result = await service.getAnalytics(30);

    expect(result.requesterAnalytics.duplicateSubmissionRate).toBe(1);
  });

  // ── combined correctness check ──────────────────────────────────────────────

  it('computes both KPIs correctly in a realistic mixed scenario', async () => {
    const prisma = service['prisma'] as any;
    // 4 reports:
    //  R1: converted, closed RESOLVED, no warning
    //  R2: converted, closed PARTIALLY_RESOLVED, with warning
    //  R3: converted, still open (excluded from accuracy denominator), no warning
    //  R4: not converted, with warning
    setupMocks(prisma, [
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-r1', status: 'CLOSED', interventionLogs: [{ result: 'RESOLVED' }] },
        ],
        submittedDespiteWarning: false,
      }),
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-r2', status: 'CLOSED', interventionLogs: [{ result: 'PARTIALLY_RESOLVED' }] },
        ],
        submittedDespiteWarning: true,
      }),
      buildReport({
        derivedWorkOrders: [
          { id: 'wo-r3', status: 'IN_PROGRESS', interventionLogs: [] },
        ],
        submittedDespiteWarning: false,
      }),
      buildReport({ derivedWorkOrders: [], submittedDespiteWarning: true }),
    ]);

    const result = await service.getAnalytics(30);
    const ra = result.requesterAnalytics;

    // Closed conversions: R1 and R2 only (R3 is open, R4 has no WO)
    // Resolved among closed: R1 only → 1/2 = 0.5
    expect(ra.reportAccuracyRate).toBe(0.5);
    // Reports with warning: R2 and R4 → 2/4 = 0.5
    expect(ra.duplicateSubmissionRate).toBe(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersService.getAnalytics — postPreventiveCorrectiveRate (§1.2 / §9.8)
//
//  Spec: "OT correctifs ouverts dans les N jours après une clôture préventive
//         sur le même actif" where N = POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS.
//  Rate = (# closed preventive WOs with ≥1 corrective WO opened within N days
//           on the same asset) / (total closed preventive WOs)
// ─────────────────────────────────────────────────────────────────────────────
describe('WorkOrdersService.getAnalytics — postPreventiveCorrectiveRate §1.2', () => {
  let service: WorkOrdersService;

  const ASSET_A = 'asset-a';
  const ASSET_B = 'asset-b';
  const PERIOD_DAYS = 30;

  // Preventive WO closed on ASSET_A at T0
  const T0 = new Date('2026-04-10T10:00:00Z');
  // Corrective WO opened on ASSET_A 3 days later (within a 7-day window)
  const T0_plus3d = new Date('2026-04-13T10:00:00Z');
  // Corrective WO opened on ASSET_A 10 days later (outside a 7-day window)
  const T0_plus10d = new Date('2026-04-20T10:00:00Z');

  function buildPrismaValue() {
    return {
      workOrder: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      problemReport: { findMany: jest.fn() },
      workOrderChecklistItem: { findMany: jest.fn() },
      workOrderValidation: { groupBy: jest.fn() },
      workOrderReassignment: { count: jest.fn() },
      systemConfig: { findUnique: jest.fn() },
    };
  }

  function setupBasePromiseAll(prisma: any, preventiveWOs: unknown[]) {
    prisma.workOrder.groupBy
      .mockResolvedValueOnce([]) // byStatus
      .mockResolvedValueOnce([]) // byType
      .mockResolvedValueOnce([]) // byPriority
      .mockResolvedValueOnce([]); // sourceDistRaw
    prisma.workOrder.count.mockResolvedValue(0);
    prisma.workOrder.findMany
      .mockResolvedValueOnce([]) // closedWOs
      .mockResolvedValueOnce([]) // costWOs
      .mockResolvedValueOnce([]) // correctiveWOs (MTBF/MTTR)
      .mockResolvedValueOnce([]) // techKpiWOs
      .mockResolvedValueOnce(preventiveWOs); // preventiveWOsInPeriod
    prisma.problemReport.findMany.mockResolvedValueOnce([]);
    prisma.workOrderChecklistItem.findMany.mockResolvedValueOnce([]);
    prisma.workOrderValidation.groupBy.mockResolvedValueOnce([]);
    prisma.workOrderReassignment.count.mockResolvedValueOnce(0);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(),
            findOverdueCritical: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: buildPrismaValue(),
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() },
        },
        {
          provide: PartRequestsService,
          useValue: { handleWorkOrderCancellation: jest.fn() },
        },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn() } },
        { provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorkOrdersService);
  });

  it('returns null when there are no closed preventive WOs in period', async () => {
    const prisma = service['prisma'] as any;
    setupBasePromiseAll(prisma, [
      { status: WorkOrderStatus.OPEN, assetId: ASSET_A, closedAt: null },
    ]);
    prisma.systemConfig.findUnique.mockResolvedValueOnce({ key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS', value: '7' });

    const result = await service.getAnalytics(PERIOD_DAYS);

    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveRate).toBeNull();
    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveWindowDays).toBe(7);
  });

  it('returns 1.0 when every closed preventive WO has a corrective WO within the window', async () => {
    const prisma = service['prisma'] as any;
    setupBasePromiseAll(prisma, [
      { status: WorkOrderStatus.CLOSED, assetId: ASSET_A, closedAt: T0 },
    ]);
    prisma.systemConfig.findUnique.mockResolvedValueOnce({ key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS', value: '7' });
    // correctiveFollowUps query — corrective WO on ASSET_A opened 3 days after T0
    prisma.workOrder.findMany.mockResolvedValueOnce([
      { assetId: ASSET_A, createdAt: T0_plus3d },
    ]);

    const result = await service.getAnalytics(PERIOD_DAYS);

    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveRate).toBe(1);
  });

  it('returns 0 when the corrective WO is opened after the window', async () => {
    const prisma = service['prisma'] as any;
    setupBasePromiseAll(prisma, [
      { status: WorkOrderStatus.CLOSED, assetId: ASSET_A, closedAt: T0 },
    ]);
    prisma.systemConfig.findUnique.mockResolvedValueOnce({ key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS', value: '7' });
    // correctiveFollowUps — opened 10 days later, outside the 7-day window
    prisma.workOrder.findMany.mockResolvedValueOnce([
      { assetId: ASSET_A, createdAt: T0_plus10d },
    ]);

    const result = await service.getAnalytics(PERIOD_DAYS);

    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveRate).toBe(0);
  });

  it('computes partial rate when only some preventive WOs have corrective follow-ups', async () => {
    const prisma = service['prisma'] as any;
    // Two closed preventive WOs: ASSET_A has a follow-up, ASSET_B does not
    setupBasePromiseAll(prisma, [
      { status: WorkOrderStatus.CLOSED, assetId: ASSET_A, closedAt: T0 },
      { status: WorkOrderStatus.CLOSED, assetId: ASSET_B, closedAt: T0 },
    ]);
    prisma.systemConfig.findUnique.mockResolvedValueOnce({ key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS', value: '7' });
    prisma.workOrder.findMany.mockResolvedValueOnce([
      { assetId: ASSET_A, createdAt: T0_plus3d }, // only ASSET_A gets a corrective WO
    ]);

    const result = await service.getAnalytics(PERIOD_DAYS);

    // 1 triggered out of 2 → 0.5
    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveRate).toBe(0.5);
  });

  it('uses default window of 7 days when config key is absent', async () => {
    const prisma = service['prisma'] as any;
    setupBasePromiseAll(prisma, [
      { status: WorkOrderStatus.CLOSED, assetId: ASSET_A, closedAt: T0 },
    ]);
    prisma.systemConfig.findUnique.mockResolvedValueOnce(null); // key not set
    prisma.workOrder.findMany.mockResolvedValueOnce([]);

    const result = await service.getAnalytics(PERIOD_DAYS);

    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveWindowDays).toBe(7);
    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveRate).toBe(0);
  });

  it('respects a custom window from system config', async () => {
    const prisma = service['prisma'] as any;
    setupBasePromiseAll(prisma, [
      { status: WorkOrderStatus.CLOSED, assetId: ASSET_A, closedAt: T0 },
    ]);
    // Custom window of 14 days
    prisma.systemConfig.findUnique.mockResolvedValueOnce({ key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS', value: '14' });
    // Corrective WO opened 10 days after — within 14-day window but outside 7-day
    prisma.workOrder.findMany.mockResolvedValueOnce([
      { assetId: ASSET_A, createdAt: T0_plus10d },
    ]);

    const result = await service.getAnalytics(PERIOD_DAYS);

    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveWindowDays).toBe(14);
    expect(result.preventivePlanEfficiency.postPreventiveCorrectiveRate).toBe(1);
  });
});
