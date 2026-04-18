/**
 * Unit tests for OnHoldService
 *
 * Covers:
 * - putOnHold(): asset status derivation per reason type
 * - putOnHold(): supervisorAssetStatusChoice required for OTHER reason
 * - putOnHold(): state machine guard (wrong current status)
 * - putOnHold(): notifySupervisors called
 * - resume(): state machine guard
 * - resume(): WO_RESUMED notification sent to active contributors only
 * - resume(): WO_RESUMED notification NOT sent when no contributors
 * - resume(): principal technician guard (non-principal cannot resume)
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OnHoldService } from './on-hold.service';
import { WorkOrderStatus, NotificationType, WorkOrderType } from '@gmao/db';
import { OnHoldReasonType, AssetStatus, Role } from '@gmao/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildWO(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.IN_PROGRESS,
    assetId: 'asset-1',
    type: WorkOrderType.CORRECTIVE,
    principalTechnicianId: 'tech-principal',
    assignments: [],
    ...overrides,
  };
}

function buildAsset(status = AssetStatus.IN_MAINTENANCE) {
  return { id: 'asset-1', status };
}

function buildTechnician(hourlyRate = 30) {
  return { hourlyRate };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildMocks() {
  const txWorkOrderUpdate = jest.fn().mockResolvedValue({});
  const txStatusLogCreate = jest.fn().mockResolvedValue({});
  const txOnHoldCreate = jest.fn().mockResolvedValue({});
  const txOnHoldUpdateMany = jest.fn().mockResolvedValue({});
  const txAssetUpdate = jest.fn().mockResolvedValue({});
  const txAssetStatusLogCreate = jest.fn().mockResolvedValue({});
  const txChecklistUpdateMany = jest.fn().mockResolvedValue({});
  const txInterventionUpdateMany = jest.fn().mockResolvedValue({});
  const txInterventionCreate = jest.fn().mockResolvedValue({});

  const tx = {
    workOrder: { update: txWorkOrderUpdate },
    workOrderStatusLog: { create: txStatusLogCreate },
    onHoldPeriod: { create: txOnHoldCreate, updateMany: txOnHoldUpdateMany },
    asset: { update: txAssetUpdate },
    assetStatusLog: { create: txAssetStatusLogCreate },
    workOrderChecklistItem: { updateMany: txChecklistUpdateMany },
    interventionLog: { updateMany: txInterventionUpdateMany, create: txInterventionCreate },
  };

  type TxShape = typeof tx;

  const prisma = {
    asset: { findUniqueOrThrow: jest.fn().mockResolvedValue(buildAsset()) },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue(buildTechnician()) },
    $transaction: jest.fn().mockImplementation((fn: (t: TxShape) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    findById: jest.fn().mockResolvedValue(buildWO()),
  };

  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
    notifySupervisors: jest.fn().mockResolvedValue(undefined),
    notifyMany: jest.fn().mockResolvedValue(undefined),
  };

  const service = new OnHoldService(prisma as never, repo as never, notifications as never);

  return { service, prisma, repo, notifications, tx: {
    workOrderUpdate: txWorkOrderUpdate,
    onHoldCreate: txOnHoldCreate,
    onHoldUpdateMany: txOnHoldUpdateMany,
    assetUpdate: txAssetUpdate,
    interventionCreate: txInterventionCreate,
  }};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OnHoldService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── putOnHold() ─────────────────────────────────────────────────────────────

  describe('putOnHold()', () => {
    it('sets asset status to MAINTENANCE_BLOCKED for MISSING_PART reason', async () => {
      const { service, prisma, repo, tx } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO()).mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.ON_HOLD }));

      await service.putOnHold('wo-1', { reasonType: OnHoldReasonType.MISSING_PART, detail: 'part needed' }, 'tech-principal');

      expect(tx.assetUpdate).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.MAINTENANCE_BLOCKED },
      });
    });

    it('sets asset status to MAINTENANCE_BLOCKED for EXTERNAL_CONTRACTOR reason', async () => {
      const { service, prisma, repo, tx } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO()).mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.ON_HOLD }));

      await service.putOnHold('wo-1', { reasonType: OnHoldReasonType.EXTERNAL_CONTRACTOR }, 'tech-principal');

      expect(tx.assetUpdate).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.MAINTENANCE_BLOCKED },
      });
    });

    it('sets asset status to MAINTENANCE_BLOCKED for ACCESS_DENIED on CORRECTIVE WO', async () => {
      const { service, repo, tx } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO({ type: WorkOrderType.CORRECTIVE })).mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.ON_HOLD }));

      await service.putOnHold('wo-1', { reasonType: OnHoldReasonType.ACCESS_DENIED }, 'tech-principal');

      expect(tx.assetUpdate).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.MAINTENANCE_BLOCKED },
      });
    });

    it('sets asset status to OPERATIONAL for ACCESS_DENIED on PREVENTIVE WO', async () => {
      const { service, repo, tx } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO({ type: WorkOrderType.PREVENTIVE })).mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.ON_HOLD }));

      await service.putOnHold('wo-1', { reasonType: OnHoldReasonType.ACCESS_DENIED }, 'tech-principal');

      expect(tx.assetUpdate).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.OPERATIONAL },
      });
    });

    it('uses supervisorAssetStatusChoice for OTHER reason', async () => {
      const { service, repo, tx } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO()).mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.ON_HOLD }));

      await service.putOnHold('wo-1', {
        reasonType: OnHoldReasonType.OTHER,
        supervisorAssetStatusChoice: AssetStatus.OUT_OF_SERVICE,
      }, 'tech-principal');

      expect(tx.assetUpdate).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.OUT_OF_SERVICE },
      });
    });

    it('throws BadRequestException when OTHER reason without supervisorAssetStatusChoice', async () => {
      const { service, repo } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO());

      await expect(
        service.putOnHold('wo-1', { reasonType: OnHoldReasonType.OTHER }, 'tech-principal'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when actor is not the principal technician', async () => {
      const { service, repo } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO({ principalTechnicianId: 'someone-else' }));

      await expect(
        service.putOnHold('wo-1', { reasonType: OnHoldReasonType.MISSING_PART }, 'tech-principal'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('notifies supervisors after hold is applied', async () => {
      const { service, repo, notifications } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO()).mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.ON_HOLD }));

      await service.putOnHold('wo-1', { reasonType: OnHoldReasonType.MISSING_PART }, 'tech-principal');

      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.WO_ON_HOLD,
        expect.any(String),
        expect.stringContaining('WO-2026-001'),
        'WorkOrder',
        'wo-1',
      );
    });

    it('throws BadRequestException when WO status transition is not allowed', async () => {
      const { service, repo } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.PENDING_VALIDATION }));

      await expect(
        service.putOnHold('wo-1', { reasonType: OnHoldReasonType.MISSING_PART }, 'tech-principal'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── resume() ───────────────────────────────────────────────────────────────

  describe('resume()', () => {
    const holdingWO = buildWO({ status: WorkOrderStatus.ON_HOLD });

    it('throws ForbiddenException when actor is not the principal technician', async () => {
      const { service, repo } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO({ principalTechnicianId: 'someone-else', status: WorkOrderStatus.ON_HOLD }));

      await expect(service.resume('wo-1', {}, 'tech-principal')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does NOT send WO_RESUMED when there are no active contributors', async () => {
      const { service, repo, notifications } = buildMocks();
      repo.findById
        .mockResolvedValueOnce({ ...holdingWO, assignments: [] })
        .mockResolvedValueOnce({ ...holdingWO, status: WorkOrderStatus.IN_PROGRESS });

      await service.resume('wo-1', {}, 'tech-principal');

      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });

    it('sends WO_RESUMED only to active contributors, not to the principal', async () => {
      const { service, repo, notifications } = buildMocks();
      const assignments = [
        { technicianId: 'tech-principal', isPrincipal: true, isActive: true },
        { technicianId: 'tech-contrib-1', isPrincipal: false, isActive: true },
        { technicianId: 'tech-contrib-2', isPrincipal: false, isActive: true },
        { technicianId: 'tech-inactive', isPrincipal: false, isActive: false },
      ];
      repo.findById
        .mockResolvedValueOnce({ ...holdingWO, assignments })
        .mockResolvedValueOnce({ ...holdingWO, status: WorkOrderStatus.IN_PROGRESS });

      await service.resume('wo-1', {}, 'tech-principal');

      expect(notifications.notifyMany).toHaveBeenCalledTimes(1);
      const notifyManyArg = notifications.notifyMany.mock.calls[0][0] as { recipientId: string }[];
      const recipientIds = notifyManyArg.map((n) => n.recipientId);
      expect(recipientIds).toEqual(expect.arrayContaining(['tech-contrib-1', 'tech-contrib-2']));
      expect(recipientIds).not.toContain('tech-principal');
      expect(recipientIds).not.toContain('tech-inactive');
    });

    it('sends WO_RESUMED with correct type and entityId', async () => {
      const { service, repo, notifications } = buildMocks();
      const assignments = [
        { technicianId: 'tech-principal', isPrincipal: true, isActive: true },
        { technicianId: 'tech-contrib', isPrincipal: false, isActive: true },
      ];
      repo.findById
        .mockResolvedValueOnce({ ...holdingWO, assignments })
        .mockResolvedValueOnce({ ...holdingWO, status: WorkOrderStatus.IN_PROGRESS });

      await service.resume('wo-1', {}, 'tech-principal');

      const notifyManyArg = notifications.notifyMany.mock.calls[0][0] as { type: string; entityId: string }[];
      expect(notifyManyArg[0].type).toBe(NotificationType.WO_RESUMED);
      expect(notifyManyArg[0].entityId).toBe('wo-1');
    });

    it('throws BadRequestException when WO status transition is not allowed', async () => {
      const { service, repo } = buildMocks();
      repo.findById.mockResolvedValueOnce(buildWO({ status: WorkOrderStatus.IN_PROGRESS }));

      await expect(service.resume('wo-1', {}, 'tech-principal')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
