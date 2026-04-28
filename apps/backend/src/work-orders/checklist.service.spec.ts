import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { WorkOrderStatus } from '@gmao/db';
import { ChecklistItemStatus } from '@gmao/shared';

const ACTOR_ID = 'tech-1';
const WO_ID = 'wo-1';
const ITEM_ID = 'item-1';

function buildWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: WO_ID,
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.IN_PROGRESS,
    assetId: 'asset-1',
    priority: 'HIGH',
    sourcePlanId: 'plan-1',
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    workOrderId: WO_ID,
    description: 'Check pressure valve',
    status: ChecklistItemStatus.PENDING,
    isMandatory: true,
    autoCreateCorrectiveWO: false,
    ...overrides,
  };
}

function buildMocks() {
  const txWorkOrderCreate = jest.fn().mockResolvedValue({ id: 'new-wo-1' });

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    workOrder: {
      create: txWorkOrderCreate,
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const prisma = {
    workOrderAssignment: {
      findFirst: jest.fn(),
    },
    workOrderChecklistItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    asset: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'asset-1',
        location: { fullPath: 'Building A / Floor 1' },
      }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(
        (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      ),
  };

  const repo = {
    findById: jest.fn(),
  };

  const service = new ChecklistService(prisma as never, repo as never);

  return { service, prisma, repo, tx: { workOrderCreate: txWorkOrderCreate } };
}

describe('ChecklistService.completeItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when WO is not IN_PROGRESS', async () => {
    const { service, repo } = buildMocks();
    repo.findById.mockResolvedValueOnce(
      buildWorkOrder({ status: WorkOrderStatus.ON_HOLD }) as never,
    );

    await expect(
      service.completeItem(WO_ID, ITEM_ID, { status: ChecklistItemStatus.DONE }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when actor is not assigned to the WO', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.completeItem(WO_ID, ITEM_ID, { status: ChecklistItemStatus.DONE }, ACTOR_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when item not found', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.completeItem(WO_ID, ITEM_ID, { status: ChecklistItemStatus.DONE }, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when item belongs to a different WO', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ workOrderId: 'other-wo' }) as never,
    );

    await expect(
      service.completeItem(WO_ID, ITEM_ID, { status: ChecklistItemStatus.DONE }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when item is already completed (not PENDING)', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ status: ChecklistItemStatus.DONE }) as never,
    );

    await expect(
      service.completeItem(WO_ID, ITEM_ID, { status: ChecklistItemStatus.DONE }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when ANOMALY_DETECTED without anomalyDescription', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(buildItem() as never);

    await expect(
      service.completeItem(
        WO_ID,
        ITEM_ID,
        { status: ChecklistItemStatus.ANOMALY_DETECTED },
        ACTOR_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when NOT_APPLICABLE on a mandatory item', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ isMandatory: true }) as never,
    );

    await expect(
      service.completeItem(
        WO_ID,
        ITEM_ID,
        { status: ChecklistItemStatus.NOT_APPLICABLE, notApplicableReason: 'N/A' },
        ACTOR_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when NOT_APPLICABLE without notApplicableReason', async () => {
    const { service, repo, prisma } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ isMandatory: false }) as never,
    );

    await expect(
      service.completeItem(
        WO_ID,
        ITEM_ID,
        { status: ChecklistItemStatus.NOT_APPLICABLE },
        ACTOR_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks item DONE without creating a WO when autoCreateCorrectiveWO is false', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ autoCreateCorrectiveWO: false }) as never,
    );
    const updatedItem = { ...buildItem(), status: ChecklistItemStatus.DONE };
    prisma.workOrderChecklistItem.update.mockResolvedValueOnce(updatedItem as never);

    const result = await service.completeItem(
      WO_ID,
      ITEM_ID,
      { status: ChecklistItemStatus.DONE },
      ACTOR_ID,
    );

    expect(result.status).toBe(ChecklistItemStatus.DONE);
    expect(tx.workOrderCreate).not.toHaveBeenCalled();
  });

  it('does NOT create corrective WO at item completion — deferred to closure submission', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder({ sourcePlanId: 'plan-1' }) as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ autoCreateCorrectiveWO: true }) as never,
    );
    const updatedItem = {
      ...buildItem(),
      status: ChecklistItemStatus.ANOMALY_DETECTED,
      anomalyDescription: 'Valve leaking',
    };
    prisma.workOrderChecklistItem.update.mockResolvedValueOnce(updatedItem as never);

    await service.completeItem(
      WO_ID,
      ITEM_ID,
      { status: ChecklistItemStatus.ANOMALY_DETECTED, anomalyDescription: 'Valve leaking' },
      ACTOR_ID,
    );

    expect(tx.workOrderCreate).not.toHaveBeenCalled();
  });

  it('does NOT create corrective WO when ANOMALY_DETECTED but autoCreateCorrectiveWO is false', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder() as never);
    prisma.workOrderAssignment.findFirst.mockResolvedValueOnce({ id: 'assign-1' });
    prisma.workOrderChecklistItem.findUnique.mockResolvedValueOnce(
      buildItem({ autoCreateCorrectiveWO: false }) as never,
    );
    prisma.workOrderChecklistItem.update.mockResolvedValueOnce({
      ...buildItem(),
      status: ChecklistItemStatus.ANOMALY_DETECTED,
    } as never);

    await service.completeItem(
      WO_ID,
      ITEM_ID,
      { status: ChecklistItemStatus.ANOMALY_DETECTED, anomalyDescription: 'Minor scratch' },
      ACTOR_ID,
    );

    expect(tx.workOrderCreate).not.toHaveBeenCalled();
  });
});
