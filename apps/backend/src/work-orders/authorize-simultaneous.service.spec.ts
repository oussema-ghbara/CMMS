/**
 * Unit tests for WorkOrdersService.authorizeSimultaneousMaintenance()
 *
 * Covers:
 * - Success path: sets simultaneousMaintenanceAuthorized to true and logs the event
 * - Notifies the principal technician on success
 * - Does NOT notify when the WO has no principal technician
 * - Throws BadRequestException when the WO is already in a terminal status
 * - Throws BadRequestException when simultaneous maintenance is already authorized
 */

import { BadRequestException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderStatus, NotificationType } from '@gmao/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.ASSIGNED,
    assetId: 'asset-1',
    principalTechnicianId: 'tech-1',
    simultaneousMaintenanceAuthorized: false,
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildMocks() {
  const txWorkOrderUpdate = jest.fn().mockResolvedValue({ id: 'wo-1' });
  const txStatusLogCreate = jest.fn().mockResolvedValue({});

  const tx = {
    workOrder: { update: txWorkOrderUpdate },
    workOrderStatusLog: { create: txStatusLogCreate },
  };

  type TxShape = typeof tx;

  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: (t: TxShape) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    findById: jest.fn(),
    updatePriority: jest.fn(),
    findOverdueForEscalation: jest.fn(),
  };

  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
    notifySupervisors: jest.fn().mockResolvedValue(undefined),
    notifyMany: jest.fn().mockResolvedValue(undefined),
  };

  const partRequests = {
    handleWorkOrderCancellation: jest.fn().mockResolvedValue(undefined),
  };

  const service = new WorkOrdersService(
    repo as never,
    prisma as never,
    notifications as never,
    partRequests as never,
  );

  return {
    service,
    prisma,
    repo,
    notifications,
    tx: {
      workOrderUpdate: txWorkOrderUpdate,
      statusLogCreate: txStatusLogCreate,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkOrdersService.authorizeSimultaneousMaintenance()', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Success path', () => {
    it('sets simultaneousMaintenanceAuthorized to true inside a transaction', async () => {
      const { service, repo, tx } = buildMocks();
      const wo = buildWorkOrder();

      repo.findById
        .mockResolvedValueOnce(wo)
        .mockResolvedValueOnce({ ...wo, simultaneousMaintenanceAuthorized: true });

      await service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1');

      expect(tx.workOrderUpdate).toHaveBeenCalledWith({
        where: { id: 'wo-1' },
        data: { simultaneousMaintenanceAuthorized: true },
      });
    });

    it('creates a status log entry with the authorization label', async () => {
      const { service, repo, tx } = buildMocks();
      const wo = buildWorkOrder();

      repo.findById
        .mockResolvedValueOnce(wo)
        .mockResolvedValueOnce({ ...wo, simultaneousMaintenanceAuthorized: true });

      await service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1');

      expect(tx.statusLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workOrderId: 'wo-1',
            actorId: 'supervisor-1',
            label: 'Simultaneous maintenance authorized by supervisor',
          }),
        }),
      );
    });

    it('retains the current status in both fromStatus and toStatus of the log', async () => {
      const { service, repo, tx } = buildMocks();
      const wo = buildWorkOrder({ status: WorkOrderStatus.ASSIGNED });

      repo.findById
        .mockResolvedValueOnce(wo)
        .mockResolvedValueOnce({ ...wo, simultaneousMaintenanceAuthorized: true });

      await service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1');

      expect(tx.statusLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: WorkOrderStatus.ASSIGNED,
            toStatus: WorkOrderStatus.ASSIGNED,
          }),
        }),
      );
    });

    it('notifies the principal technician via SIMULTANEOUS_MAINTENANCE_AUTHORIZED', async () => {
      const { service, repo, notifications } = buildMocks();
      const wo = buildWorkOrder({ principalTechnicianId: 'tech-1' });

      repo.findById
        .mockResolvedValueOnce(wo)
        .mockResolvedValueOnce({ ...wo, simultaneousMaintenanceAuthorized: true });

      await service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'tech-1',
          type: NotificationType.SIMULTANEOUS_MAINTENANCE_AUTHORIZED,
          entityType: 'WorkOrder',
          entityId: 'wo-1',
        }),
      );
    });

    it('returns the refreshed work order from repo.findById', async () => {
      const { service, repo } = buildMocks();
      const wo = buildWorkOrder();
      const refreshed = { ...wo, simultaneousMaintenanceAuthorized: true };

      repo.findById
        .mockResolvedValueOnce(wo)
        .mockResolvedValueOnce(refreshed);

      const result = await service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1');

      expect(result).toBe(refreshed);
      expect(repo.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('No principal technician', () => {
    it('does not send a notification when principalTechnicianId is null', async () => {
      const { service, repo, notifications } = buildMocks();
      const wo = buildWorkOrder({ principalTechnicianId: null });

      repo.findById
        .mockResolvedValueOnce(wo)
        .mockResolvedValueOnce({ ...wo, simultaneousMaintenanceAuthorized: true });

      await service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1');

      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('Failure cases', () => {
    it.each([WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED])(
      'throws BadRequestException when WO has terminal status %s',
      async (terminalStatus) => {
        const { service, repo } = buildMocks();
        repo.findById.mockResolvedValueOnce(buildWorkOrder({ status: terminalStatus }));

        await expect(
          service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1'),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('throws BadRequestException when simultaneous maintenance is already authorized', async () => {
      const { service, repo } = buildMocks();
      repo.findById.mockResolvedValueOnce(
        buildWorkOrder({ simultaneousMaintenanceAuthorized: true }),
      );

      await expect(
        service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not write to the database when the guard rejects', async () => {
      const { service, repo, tx } = buildMocks();
      repo.findById.mockResolvedValueOnce(
        buildWorkOrder({ status: WorkOrderStatus.CLOSED }),
      );

      await expect(
        service.authorizeSimultaneousMaintenance('wo-1', 'supervisor-1'),
      ).rejects.toThrow(BadRequestException);

      expect(tx.workOrderUpdate).not.toHaveBeenCalled();
      expect(tx.statusLogCreate).not.toHaveBeenCalled();
    });
  });
});
