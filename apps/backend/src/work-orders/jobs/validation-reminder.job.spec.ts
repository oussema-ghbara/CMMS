/**
 * Unit tests for ValidationReminderJob (§1.6 + §4.1)
 *
 * Covers:
 * - Schedule decorator registers run() with EVERY_HOUR cron expression
 * - No stale pending-validation WOs: no notifications sent, no dedup query
 * - WOs found but already notified within dedup window: skipped
 * - New WOs: VALIDATION_REMINDER_24H notification sent to supervisors
 * - Mixed (some already notified, some new): only new ones notified
 * - Dedup check uses correct 23h lookback window
 * - Work-order query targets PENDING_VALIDATION and 24h staleness threshold
 * - jobLogger.recordStart called before logic
 * - jobLogger.recordSuccess called on success
 * - jobLogger.recordFailure called and error re-thrown on failure
 */

import { CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { NotificationType, WorkOrderStatus } from '@gmao/db';
import { ValidationReminderJob } from './validation-reminder.job';

function buildPendingValidationWO(
  overrides: Partial<{ id: string; referenceNumber: string }> = {},
) {
  return {
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    ...overrides,
  };
}

function buildMocks() {
  const workOrderFindMany = jest.fn().mockResolvedValue([]);
  const notificationFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    workOrder: { findMany: workOrderFindMany },
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

  const job = new ValidationReminderJob(prisma as never, notifications as never, jobLogger as never);

  return { job, notifications, workOrderFindMany, notificationFindMany, jobLogger };
}

describe('ValidationReminderJob', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schedule decorator', () => {
    it('registers run() with an EVERY_HOUR cron expression', () => {
      const cronOptions = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        ValidationReminderJob.prototype.run,
      ) as { cronTime?: string } | undefined;

      expect(cronOptions).toBeDefined();
      expect(cronOptions?.cronTime).toBe(CronExpression.EVERY_HOUR);
    });
  });

  describe('run()', () => {
    it('does nothing when no stale pending-validation WO exists', async () => {
      const { job, notifications, notificationFindMany } = buildMocks();

      await job.run();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
      expect(notificationFindMany).not.toHaveBeenCalled();
    });

    it('sends VALIDATION_REMINDER_24H to supervisors for stale pending-validation WOs', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildPendingValidationWO()]);
      notificationFindMany.mockResolvedValue([]);

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.VALIDATION_REMINDER_24H,
        expect.any(String),
        expect.stringContaining('WO-2026-001'),
        'WorkOrder',
        'wo-1',
      );
    });

    it('skips WOs already notified within dedup window', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildPendingValidationWO({ id: 'wo-already-notified' })]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-already-notified' }]);

      await job.run();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
    });

    it('only notifies WOs not in already-notified set', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      const wo1 = buildPendingValidationWO({ id: 'wo-1', referenceNumber: 'WO-001' });
      const wo2 = buildPendingValidationWO({ id: 'wo-2', referenceNumber: 'WO-002' });
      workOrderFindMany.mockResolvedValue([wo1, wo2]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-1' }]);

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.VALIDATION_REMINDER_24H,
        expect.any(String),
        expect.stringContaining('WO-002'),
        'WorkOrder',
        'wo-2',
      );
    });

    it('queries notification dedup window with a 23h lookback', async () => {
      const { job, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildPendingValidationWO()]);
      notificationFindMany.mockResolvedValue([]);

      const before = new Date();
      await job.run();
      const after = new Date();

      const notificationQuery = notificationFindMany.mock.calls[0][0] as {
        where: {
          type: string;
          entityType: string;
          entityId: { in: string[] };
          createdAt: { gte: Date };
        };
      };

      expect(notificationQuery.where.type).toBe(NotificationType.VALIDATION_REMINDER_24H);
      expect(notificationQuery.where.entityType).toBe('WorkOrder');
      expect(notificationQuery.where.entityId.in).toContain('wo-1');

      const dedupSince = notificationQuery.where.createdAt.gte.getTime();
      const expectedMin = before.getTime() - 23 * 60 * 60 * 1000;
      const expectedMax = after.getTime() - 23 * 60 * 60 * 1000;
      expect(dedupSince).toBeGreaterThanOrEqual(expectedMin);
      expect(dedupSince).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('queries work orders by PENDING_VALIDATION status and 24h threshold', async () => {
      const { job, workOrderFindMany } = buildMocks();

      const before = new Date();
      await job.run();
      const after = new Date();

      const woQuery = workOrderFindMany.mock.calls[0][0] as {
        where: {
          status: WorkOrderStatus;
          updatedAt: { lte: Date };
        };
      };

      expect(woQuery.where.status).toBe(WorkOrderStatus.PENDING_VALIDATION);

      const pendingSince = woQuery.where.updatedAt.lte.getTime();
      const expectedMin = before.getTime() - 24 * 60 * 60 * 1000;
      const expectedMax = after.getTime() - 24 * 60 * 60 * 1000;
      expect(pendingSince).toBeGreaterThanOrEqual(expectedMin);
      expect(pendingSince).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('propagates notification errors to preserve failure visibility', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildPendingValidationWO()]);
      notificationFindMany.mockResolvedValue([]);
      (notifications.notifySupervisors as jest.Mock).mockRejectedValueOnce(new Error('mail transport down'));

      await expect(job.run()).rejects.toThrow('mail transport down');
      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
    });
  });

  describe('job lifecycle logging (§4.1)', () => {
    it('calls recordStart at the beginning of run()', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordStart).toHaveBeenCalledWith('validation-reminder');
    });

    it('calls recordSuccess after successful execution', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordSuccess).toHaveBeenCalledWith('validation-reminder');
      expect(jobLogger.recordFailure).not.toHaveBeenCalled();
    });

    it('calls recordFailure and re-throws on error', async () => {
      const { job, notifications, workOrderFindMany, notificationFindMany, jobLogger } = buildMocks();
      workOrderFindMany.mockResolvedValue([buildPendingValidationWO()]);
      notificationFindMany.mockResolvedValue([]);
      const err = new Error('dispatch error');
      (notifications.notifySupervisors as jest.Mock).mockRejectedValueOnce(err);

      await expect(job.run()).rejects.toThrow('dispatch error');
      expect(jobLogger.recordFailure).toHaveBeenCalledWith('validation-reminder', err);
      expect(jobLogger.recordSuccess).not.toHaveBeenCalled();
    });
  });
});