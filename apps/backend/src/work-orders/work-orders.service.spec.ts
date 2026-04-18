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
