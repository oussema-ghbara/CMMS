/**
 * Unit tests for ContractorDateOverdueJob (§1.6)
 *
 * Covers:
 * - Schedule decorator registers run() with EVERY_HOUR cron expression
 * - No overdue contractor holds: no notifications sent, dedup query skipped
 * - Holds found but already notified within dedup window: skipped
 * - New overdue holds: CONTRACTOR_DATE_OVERDUE notification sent to supervisors
 * - Mixed holds (some notified, some new): only new ones notified
 * - Dedup check uses correct 23h lookback window
 * - Hold period query targets EXTERNAL_CONTRACTOR, resumedAt: null, expectedResolutionDate < now
 */

import { CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { NotificationType, OnHoldReasonType } from '@gmao/db';
import { ContractorDateOverdueJob } from './contractor-date-overdue.job';

function buildOverdueHold(overrides: Partial<{ id: string; workOrderId: string }> = {}) {
  return {
    id: 'hold-1',
    workOrderId: 'wo-1',
    workOrder: { referenceNumber: 'WO-2026-001' },
    expectedResolutionDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    ...overrides,
  };
}

function buildMocks() {
  const onHoldFindMany = jest.fn().mockResolvedValue([]);
  const notificationFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    onHoldPeriod: { findMany: onHoldFindMany },
    notification: { findMany: notificationFindMany },
  };

  const notifications = {
    notifySupervisors: jest.fn().mockResolvedValue(undefined),
  };

  const jobLogger = {
    recordStart: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
  };

  const job = new ContractorDateOverdueJob(prisma as never, notifications as never, jobLogger as never);

  return { job, notifications, onHoldFindMany, notificationFindMany, jobLogger };
}

describe('ContractorDateOverdueJob', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schedule decorator', () => {
    it('registers run() with an EVERY_HOUR cron expression', () => {
      const cronOptions = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        ContractorDateOverdueJob.prototype.run,
      ) as { cronTime?: string } | undefined;

      expect(cronOptions).toBeDefined();
      expect(cronOptions?.cronTime).toBe(CronExpression.EVERY_HOUR);
    });
  });

  describe('run()', () => {
    it('does nothing when no overdue contractor holds exist', async () => {
      const { job, notifications, notificationFindMany } = buildMocks();

      await job.run();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
      expect(notificationFindMany).not.toHaveBeenCalled();
    });

    it('sends CONTRACTOR_DATE_OVERDUE to supervisors for overdue holds', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildOverdueHold()]);
      notificationFindMany.mockResolvedValue([]);

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.CONTRACTOR_DATE_OVERDUE,
        expect.any(String),
        expect.stringContaining('WO-2026-001'),
        'WorkOrder',
        'wo-1',
      );
    });

    it('skips holds already notified within dedup window', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildOverdueHold({ workOrderId: 'wo-already-notified' })]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-already-notified' }]);

      await job.run();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
    });

    it('only notifies WOs not in already-notified set', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      const hold1 = buildOverdueHold({ workOrderId: 'wo-1' });
      const hold2 = buildOverdueHold({ id: 'hold-2', workOrderId: 'wo-2' });
      // Override workOrder ref for hold2
      (hold2 as Record<string, unknown>).workOrder = { referenceNumber: 'WO-2026-002' };
      onHoldFindMany.mockResolvedValue([hold1, hold2]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-1' }]);

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.CONTRACTOR_DATE_OVERDUE,
        expect.any(String),
        expect.stringContaining('WO-2026-002'),
        'WorkOrder',
        'wo-2',
      );
    });

    it('queries hold periods with EXTERNAL_CONTRACTOR, resumedAt: null, expectedResolutionDate < now', async () => {
      const { job, onHoldFindMany } = buildMocks();

      const before = new Date();
      await job.run();
      const after = new Date();

      const holdQuery = onHoldFindMany.mock.calls[0][0] as {
        where: {
          reasonType: string;
          resumedAt: null;
          expectedResolutionDate: { not: null; lt: Date };
        };
      };

      expect(holdQuery.where.reasonType).toBe(OnHoldReasonType.EXTERNAL_CONTRACTOR);
      expect(holdQuery.where.resumedAt).toBeNull();
      expect(holdQuery.where.expectedResolutionDate.not).toBeNull();

      const ltDate = holdQuery.where.expectedResolutionDate.lt.getTime();
      expect(ltDate).toBeGreaterThanOrEqual(before.getTime() - 100);
      expect(ltDate).toBeLessThanOrEqual(after.getTime() + 100);
    });

    it('dedup query uses 23h lookback window and targets CONTRACTOR_DATE_OVERDUE type', async () => {
      const { job, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildOverdueHold()]);
      notificationFindMany.mockResolvedValue([]);

      const before = new Date();
      await job.run();
      const after = new Date();

      const notifQuery = notificationFindMany.mock.calls[0][0] as {
        where: {
          type: string;
          entityType: string;
          entityId: { in: string[] };
          createdAt: { gte: Date };
        };
      };

      expect(notifQuery.where.type).toBe(NotificationType.CONTRACTOR_DATE_OVERDUE);
      expect(notifQuery.where.entityType).toBe('WorkOrder');
      expect(notifQuery.where.entityId.in).toContain('wo-1');

      const dedupSince = notifQuery.where.createdAt.gte.getTime();
      const expectedMin = before.getTime() - 23 * 60 * 60 * 1000;
      const expectedMax = after.getTime() - 23 * 60 * 60 * 1000;
      expect(dedupSince).toBeGreaterThanOrEqual(expectedMin);
      expect(dedupSince).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('propagates notification errors to preserve failure visibility', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildOverdueHold()]);
      notificationFindMany.mockResolvedValue([]);
      (notifications.notifySupervisors as jest.Mock).mockRejectedValueOnce(new Error('transport down'));

      await expect(job.run()).rejects.toThrow('transport down');
    });
  });

  describe('job lifecycle logging (§4.1)', () => {
    it('calls recordStart with "contractor-date-overdue"', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordStart).toHaveBeenCalledWith('contractor-date-overdue');
    });

    it('calls recordSuccess on successful execution', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordSuccess).toHaveBeenCalledWith('contractor-date-overdue');
      expect(jobLogger.recordFailure).not.toHaveBeenCalled();
    });

    it('calls recordFailure and re-throws on error', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany, jobLogger } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildOverdueHold()]);
      notificationFindMany.mockResolvedValue([]);
      const err = new Error('dispatch failure');
      (notifications.notifySupervisors as jest.Mock).mockRejectedValueOnce(err);

      await expect(job.run()).rejects.toThrow('dispatch failure');
      expect(jobLogger.recordFailure).toHaveBeenCalledWith('contractor-date-overdue', err);
      expect(jobLogger.recordSuccess).not.toHaveBeenCalled();
    });
  });
});
