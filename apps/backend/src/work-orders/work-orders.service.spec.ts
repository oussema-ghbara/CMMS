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
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { AssetStatus, WorkOrderStatus } from '@gmao/db';
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
            findOverdueForEscalation: jest.fn(),
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
            findOverdueForEscalation: jest.fn(),
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
            findOverdueForEscalation: jest.fn(),
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
      .mockResolvedValueOnce([{ priority: WorkOrderPriority.HIGH, _count: { id: 3 } }]);
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
          contractorCost: '0.00',
          interventionLogs: [
            { activeDurationMinutes: 30, hourlyRateAtTime: '80.00' },
          ],
          stockMovements: [
            { type: 'OUTGOING', quantity: 2, unitCostAtTime: '5.00' },
          ],
        },
      ]);

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
            findOverdueForEscalation: jest.fn(),
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
            findOverdueForEscalation: jest.fn(),
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
          useValue: { create: jest.fn(), findAll: jest.fn(), findById: jest.fn(), updateStatus: jest.fn(), updatePriority: jest.fn(), findOverdueForEscalation: jest.fn() },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyMany: jest.fn(), notifySupervisors: jest.fn() } },
        { provide: PartRequestsService, useValue: { handleWorkOrderCancellation: jest.fn() } },
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
