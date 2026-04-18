import { BadRequestException } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { AssignmentRole, NotificationType, WorkOrderStatus } from '@gmao/db';

const ACTOR_ID = 'supervisor-1';

function buildWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.IN_PROGRESS,
    principalTechnicianId: 'tech-old',
    assetId: 'asset-1',
    ...overrides,
  };
}

function buildMocks() {
  const txAssignmentUpdateMany = jest.fn().mockResolvedValue({});
  const txAssignmentUpdate = jest.fn().mockResolvedValue({});
  const txInterventionUpdateMany = jest.fn().mockResolvedValue({});
  const txWorkOrderUpdate = jest.fn().mockResolvedValue({});
  const txReassignmentCreate = jest.fn().mockResolvedValue({});

  const tx = {
    workOrderAssignment: {
      updateMany: txAssignmentUpdateMany,
      update: txAssignmentUpdate,
    },
    interventionLog: {
      updateMany: txInterventionUpdateMany,
    },
    workOrder: {
      update: txWorkOrderUpdate,
    },
    workOrderReassignment: {
      create: txReassignmentCreate,
    },
  };

  const prisma = {
    workOrderAssignment: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const repo = {
    findById: jest.fn(),
  };

  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AssignmentService(prisma as never, repo as never, notifications as never);

  return {
    service,
    prisma,
    repo,
    notifications,
    tx: {
      assignmentUpdateMany: txAssignmentUpdateMany,
      assignmentUpdate: txAssignmentUpdate,
      interventionUpdateMany: txInterventionUpdateMany,
      workOrderUpdate: txWorkOrderUpdate,
      reassignmentCreate: txReassignmentCreate,
    },
  };
}

describe('AssignmentService.promote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects promotion when the work order is in a terminal status', async () => {
    const { service, repo, prisma, notifications } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CANCELLED }) as never);

    await expect(
      service.promote('wo-1', { newPrincipalId: 'tech-new' }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.workOrderAssignment.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('closes the old principal intervention log when promoting during IN_PROGRESS', async () => {
    const { service, repo, prisma, tx, notifications } = buildMocks();
    repo.findById
      .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.IN_PROGRESS }) as never)
      .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.IN_PROGRESS, principalTechnicianId: 'tech-new' }) as never);
    (prisma.workOrderAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      role: AssignmentRole.CONTRIBUTOR,
      isActive: true,
    });

    await service.promote('wo-1', { newPrincipalId: 'tech-new' }, ACTOR_ID);

    expect(tx.assignmentUpdateMany).toHaveBeenCalledWith({
      where: {
        workOrderId: 'wo-1',
        technicianId: 'tech-old',
        role: AssignmentRole.PRINCIPAL,
        isActive: true,
      },
      data: { isActive: false, removedAt: expect.any(Date) },
    });
    expect(tx.interventionUpdateMany).toHaveBeenCalledWith({
      where: {
        workOrderId: 'wo-1',
        technicianId: 'tech-old',
        endedAt: null,
      },
      data: { endedAt: expect.any(Date), isReassignmentRemnant: true },
    });
    expect(tx.assignmentUpdate).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: { role: AssignmentRole.PRINCIPAL },
    });
    expect(tx.workOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'wo-1' },
      data: { principalTechnicianId: 'tech-new' },
    });
    expect(tx.reassignmentCreate).toHaveBeenCalledWith({
      data: {
        workOrderId: 'wo-1',
        fromTechnicianId: 'tech-old',
        toTechnicianId: 'tech-new',
        reason: 'TECHNICIAN_ABSENT',
        reasonDetail: 'Promoted from contributor',
        performedById: ACTOR_ID,
      },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'tech-new',
        type: NotificationType.PROMOTED_TO_PRINCIPAL,
        entityId: 'wo-1',
      }),
    );
  });

  it('does not touch intervention logs when promoting an ASSIGNED work order', async () => {
    const { service, repo, prisma, tx } = buildMocks();
    repo.findById.mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.ASSIGNED }) as never);
    (prisma.workOrderAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      role: AssignmentRole.CONTRIBUTOR,
      isActive: true,
    });

    await service.promote('wo-1', { newPrincipalId: 'tech-new' }, ACTOR_ID);

    expect(tx.interventionUpdateMany).not.toHaveBeenCalled();
    expect(tx.assignmentUpdate).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: { role: AssignmentRole.PRINCIPAL },
    });
  });
});
