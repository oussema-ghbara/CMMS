/**
 * Unit tests for WorkOrdersService.autoEscalateOverduePriorities (§4.3)
 *
 * Covers:
 * - CRITICAL overdue WOs → WO_OVERDUE notification sent to supervisors, no priority change
 * - Non-CRITICAL overdue WOs → escalated in priority + WO_AUTO_ESCALATED notification
 * - Both paths can fire in the same run
 * - Return value includes criticalNotified count
 * - No notifications when no overdue WOs
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { StorageService } from '../storage/storage.service';
import { ReportGenerationService } from './report-generation.service';
import { NotificationType, WorkOrderStatus } from '@gmao/db';
import { WorkOrderPriority } from '@gmao/shared';

function buildMocks() {
  const findOverdueCritical = jest.fn().mockResolvedValue([]);
  const findOverdueForEscalation = jest.fn().mockResolvedValue([]);
  const updatePriority = jest.fn().mockResolvedValue({});
  const findById = jest.fn();
  const notifySupervisors = jest.fn().mockResolvedValue(undefined);

  const repo = {
    findOverdueCritical,
    findOverdueForEscalation,
    updatePriority,
    findById,
    create: jest.fn(),
    findAll: jest.fn(),
    updateStatus: jest.fn(),
  };

  const notifications = {
    notifySupervisors,
    notify: jest.fn().mockResolvedValue(undefined),
    notifyMany: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    asset: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    workOrder: { findFirst: jest.fn(), update: jest.fn() },
    workOrderAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((fns: unknown[]) => Promise.all(fns)),
  };

  const partRequests = { handleWorkOrderCancellation: jest.fn() };
  const storage = {};
  const reportGenerator = {};

  return { repo, notifications, prisma, partRequests, findOverdueCritical, findOverdueForEscalation, updatePriority, notifySupervisors };
}

async function buildService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      WorkOrdersService,
      { provide: WorkOrdersRepository, useValue: mocks.repo },
      { provide: PrismaService, useValue: mocks.prisma },
      { provide: NotificationsService, useValue: mocks.notifications },
      { provide: PartRequestsService, useValue: mocks.partRequests },
      { provide: StorageService, useValue: {} },
      { provide: ReportGenerationService, useValue: {} },
    ],
  }).compile();
  return module.get(WorkOrdersService);
}

describe('WorkOrdersService.autoEscalateOverduePriorities (§4.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zeros when no overdue WOs exist', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);

    const result = await service.autoEscalateOverduePriorities();

    expect(result).toEqual({ checked: 0, escalated: 0, criticalNotified: 0 });
    expect(mocks.notifySupervisors).not.toHaveBeenCalled();
    expect(mocks.updatePriority).not.toHaveBeenCalled();
  });

  describe('CRITICAL overdue WOs (§4.3)', () => {
    it('sends WO_OVERDUE to supervisors for each CRITICAL overdue WO', async () => {
      const mocks = buildMocks();
      mocks.findOverdueCritical.mockResolvedValue([
        { id: 'wo-1', referenceNumber: 'WO-2026-001' },
        { id: 'wo-2', referenceNumber: 'WO-2026-002' },
      ]);
      const service = await buildService(mocks);

      const result = await service.autoEscalateOverduePriorities();

      expect(mocks.notifySupervisors).toHaveBeenCalledTimes(2);
      expect(mocks.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.WO_OVERDUE,
        expect.any(String),
        expect.stringContaining('WO-2026-001'),
        'WorkOrder',
        'wo-1',
      );
      expect(mocks.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.WO_OVERDUE,
        expect.any(String),
        expect.stringContaining('WO-2026-002'),
        'WorkOrder',
        'wo-2',
      );
      expect(result.criticalNotified).toBe(2);
    });

    it('does NOT call updatePriority for CRITICAL WOs', async () => {
      const mocks = buildMocks();
      mocks.findOverdueCritical.mockResolvedValue([{ id: 'wo-1', referenceNumber: 'WO-2026-001' }]);
      const service = await buildService(mocks);

      await service.autoEscalateOverduePriorities();

      expect(mocks.updatePriority).not.toHaveBeenCalled();
    });
  });

  describe('Non-CRITICAL overdue WOs (§4.3)', () => {
    it('escalates HIGH → CRITICAL and notifies supervisors', async () => {
      const mocks = buildMocks();
      mocks.findOverdueForEscalation.mockResolvedValue([
        { id: 'wo-3', referenceNumber: 'WO-2026-003', priority: WorkOrderPriority.HIGH },
      ]);
      const service = await buildService(mocks);

      const result = await service.autoEscalateOverduePriorities();

      expect(mocks.updatePriority).toHaveBeenCalledWith('wo-3', WorkOrderPriority.CRITICAL, null, true);
      expect(mocks.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.WO_AUTO_ESCALATED,
        expect.any(String),
        expect.stringContaining('WO-2026-003'),
        'WorkOrder',
        'wo-3',
      );
      expect(result.escalated).toBe(1);
    });

    it('escalates MEDIUM → HIGH', async () => {
      const mocks = buildMocks();
      mocks.findOverdueForEscalation.mockResolvedValue([
        { id: 'wo-4', referenceNumber: 'WO-2026-004', priority: WorkOrderPriority.MEDIUM },
      ]);
      const service = await buildService(mocks);

      await service.autoEscalateOverduePriorities();

      expect(mocks.updatePriority).toHaveBeenCalledWith('wo-4', WorkOrderPriority.HIGH, null, true);
    });

    it('returns correct checked count', async () => {
      const mocks = buildMocks();
      mocks.findOverdueForEscalation.mockResolvedValue([
        { id: 'wo-5', referenceNumber: 'WO-2026-005', priority: WorkOrderPriority.LOW },
        { id: 'wo-6', referenceNumber: 'WO-2026-006', priority: WorkOrderPriority.MEDIUM },
      ]);
      const service = await buildService(mocks);

      const result = await service.autoEscalateOverduePriorities();

      expect(result.checked).toBe(2);
      expect(result.escalated).toBe(2);
    });
  });

  describe('Mixed run: CRITICAL + non-CRITICAL overdue', () => {
    it('handles both in a single run', async () => {
      const mocks = buildMocks();
      mocks.findOverdueCritical.mockResolvedValue([{ id: 'wo-c', referenceNumber: 'WO-CRIT' }]);
      mocks.findOverdueForEscalation.mockResolvedValue([
        { id: 'wo-m', referenceNumber: 'WO-MED', priority: WorkOrderPriority.MEDIUM },
      ]);
      const service = await buildService(mocks);

      const result = await service.autoEscalateOverduePriorities();

      expect(result.criticalNotified).toBe(1);
      expect(result.escalated).toBe(1);
      expect(result.checked).toBe(1);
      // WO_OVERDUE for critical
      expect(mocks.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.WO_OVERDUE, expect.any(String), expect.any(String), 'WorkOrder', 'wo-c',
      );
      // WO_AUTO_ESCALATED for medium
      expect(mocks.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.WO_AUTO_ESCALATED, expect.any(String), expect.any(String), 'WorkOrder', 'wo-m',
      );
    });
  });
});
