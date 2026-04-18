/**
 * Unit tests for DueDateApproachingJob (§1.7)
 *
 * Covers:
 * - Schedule decorator registers run() with EVERY_HOUR cron expression
 * - No WOs approaching: no notifications sent, no dedup query
 * - WOs found but already notified within dedup window: skipped
 * - New WOs: DUE_DATE_APPROACHING notification sent to principalTechnicianId
 * - Mixed (some already notified, some new): only new ones notified
 * - Dedup check uses correct 23h lookback window
 * - Notification contains correct type, entityType, entityId, recipientId
 * - Multiple WOs: each gets an individual notification
 * - WOs with null principalTechnicianId excluded (covered by DB query predicate test)
 */

import { CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { NotificationType } from '@gmao/db';
import { DueDateApproachingJob } from './due-date-approaching.job';

// ── Helpers ───────────────────────────────────────────────────────────────────

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function buildApproachingWO(overrides: Partial<{ id: string; referenceNumber: string; dueDate: Date; principalTechnicianId: string }> = {}) {
  const now = new Date();
  return {
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    dueDate: addHours(now, 12),
    principalTechnicianId: 'tech-1',
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildMocks() {
  const workOrderFindMany = jest.fn().mockResolvedValue([]);
  const notificationFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    workOrder: { findMany: workOrderFindMany },
    notification: { findMany: notificationFindMany },
  };

  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
  };

  const job = new DueDateApproachingJob(prisma as never, notifications as never);

  return { job, prisma, notifications, workOrderFindMany, notificationFindMany };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DueDateApproachingJob', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schedule decorator', () => {
    it('registers run() with an EVERY_HOUR cron expression', () => {
      const cronOptions = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        DueDateApproachingJob.prototype.run,
      ) as { cronTime?: string } | undefined;

      expect(cronOptions).toBeDefined();
      expect(cronOptions?.cronTime).toBe(CronExpression.EVERY_HOUR);
    });
  });

  describe('run()', () => {
    it('does nothing when no WOs are approaching their due date', async () => {
      const { job, notifications, notificationFindMany } = buildMocks();

      await job.run();

      expect(notifications.notify).not.toHaveBeenCalled();
      expect(notificationFindMany).not.toHaveBeenCalled();
    });

    it('sends DUE_DATE_APPROACHING to the principal technician', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      const wo = buildApproachingWO();
      workOrderFindMany.mockResolvedValue([wo]);
      notificationFindMany.mockResolvedValue([]);

      await job.run();

      expect(notifications.notify).toHaveBeenCalledTimes(1);
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'tech-1',
          type: NotificationType.DUE_DATE_APPROACHING,
          entityType: 'WorkOrder',
          entityId: 'wo-1',
        }),
      );
    });

    it('includes the WO reference number in the notification summary', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildApproachingWO()]);
      notificationFindMany.mockResolvedValue([]);

      await job.run();

      const call = (notifications.notify as jest.Mock).mock.calls[0][0] as { summary: string };
      expect(call.summary).toContain('WO-2026-001');
    });

    it('skips WOs that were already notified within the dedup window', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildApproachingWO({ id: 'wo-already-notified' })]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-already-notified' }]);

      await job.run();

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('only notifies WOs not in the already-notified set', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      const wo1 = buildApproachingWO({ id: 'wo-1', referenceNumber: 'WO-001', principalTechnicianId: 'tech-1' });
      const wo2 = buildApproachingWO({ id: 'wo-2', referenceNumber: 'WO-002', principalTechnicianId: 'tech-2' });
      workOrderFindMany.mockResolvedValue([wo1, wo2]);
      // wo-1 was already notified; wo-2 is new
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-1' }]);

      await job.run();

      expect(notifications.notify).toHaveBeenCalledTimes(1);
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'tech-2', entityId: 'wo-2' }),
      );
    });

    it('notifies all new WOs when none were previously notified', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      const wos = [
        buildApproachingWO({ id: 'wo-1', principalTechnicianId: 'tech-1' }),
        buildApproachingWO({ id: 'wo-2', principalTechnicianId: 'tech-2' }),
        buildApproachingWO({ id: 'wo-3', principalTechnicianId: 'tech-3' }),
      ];
      workOrderFindMany.mockResolvedValue(wos);
      notificationFindMany.mockResolvedValue([]);

      await job.run();

      expect(notifications.notify).toHaveBeenCalledTimes(3);
    });

    it('queries for notifications within the 23h dedup window', async () => {
      const { job, workOrderFindMany, notificationFindMany } = buildMocks();
      const wo = buildApproachingWO();
      workOrderFindMany.mockResolvedValue([wo]);
      notificationFindMany.mockResolvedValue([]);

      const before = new Date();
      await job.run();
      const after = new Date();

      const notifQuery = notificationFindMany.mock.calls[0][0] as {
        where: { type: string; entityType: string; entityId: { in: string[] }; createdAt: { gte: Date } };
      };

      expect(notifQuery.where.type).toBe(NotificationType.DUE_DATE_APPROACHING);
      expect(notifQuery.where.entityType).toBe('WorkOrder');
      expect(notifQuery.where.entityId.in).toContain('wo-1');

      // The dedupSince should be ~23 hours ago
      const dedupSince = notifQuery.where.createdAt.gte.getTime();
      const expectedMin = before.getTime() - 23 * 60 * 60 * 1000;
      const expectedMax = after.getTime() - 23 * 60 * 60 * 1000;
      expect(dedupSince).toBeGreaterThanOrEqual(expectedMin);
      expect(dedupSince).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('queries workOrder table with correct status filter and time window', async () => {
      const { job, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([]);
      notificationFindMany.mockResolvedValue([]);

      const before = new Date();
      await job.run();
      const after = new Date();

      const woQuery = workOrderFindMany.mock.calls[0][0] as {
        where: {
          status: { in: string[] };
          dueDate: { gte: Date; lte: Date };
          principalTechnicianId: { not: null };
        };
      };

      // Status: active statuses only
      expect(woQuery.where.status.in).toEqual(
        expect.arrayContaining(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_VALIDATION']),
      );
      // dueDate window: now → now+24h
      const dueDateGte = woQuery.where.dueDate.gte.getTime();
      const dueDateLte = woQuery.where.dueDate.lte.getTime();
      expect(dueDateGte).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(dueDateLte).toBeLessThanOrEqual(after.getTime() + 24 * 60 * 60 * 1000 + 1000);
      expect(dueDateLte - dueDateGte).toBeGreaterThan(23 * 60 * 60 * 1000);
      // principalTechnicianId must not be null
      expect(woQuery.where.principalTechnicianId).toEqual({ not: null });
    });
  });
});
