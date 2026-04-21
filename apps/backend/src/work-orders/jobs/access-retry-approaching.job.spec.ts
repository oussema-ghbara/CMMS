/**
 * Unit tests for AccessRetryApproachingJob (§1.6)
 *
 * Covers:
 * - Schedule decorator registers run() with EVERY_HOUR cron expression
 * - No approaching retry holds: no notifications sent, dedup query skipped
 * - Holds found but already notified within dedup window: skipped
 * - New approaching holds: ACCESS_RETRY_APPROACHING notification sent to supervisors
 * - Mixed holds (some notified, some new): only new ones notified
 * - Dedup check uses correct 23h lookback window
 * - Hold period query targets ACCESS_DENIED, resumedAt: null, retryDate in [now, now+24h]
 */

import { CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { NotificationType, OnHoldReasonType } from '@gmao/db';
import { AccessRetryApproachingJob } from './access-retry-approaching.job';

function buildApproachingHold(overrides: Partial<{ id: string; workOrderId: string }> = {}) {
  return {
    id: 'hold-1',
    workOrderId: 'wo-1',
    workOrder: { referenceNumber: 'WO-2026-001' },
    retryDate: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h from now
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

  const job = new AccessRetryApproachingJob(prisma as never, notifications as never, jobLogger as never);

  return { job, notifications, onHoldFindMany, notificationFindMany, jobLogger };
}

describe('AccessRetryApproachingJob', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schedule decorator', () => {
    it('registers run() with an EVERY_HOUR cron expression', () => {
      const cronOptions = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        AccessRetryApproachingJob.prototype.run,
      ) as { cronTime?: string } | undefined;

      expect(cronOptions).toBeDefined();
      expect(cronOptions?.cronTime).toBe(CronExpression.EVERY_HOUR);
    });
  });

  describe('run()', () => {
    it('does nothing when no approaching access-retry holds exist', async () => {
      const { job, notifications, notificationFindMany } = buildMocks();

      await job.run();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
      expect(notificationFindMany).not.toHaveBeenCalled();
    });

    it('sends ACCESS_RETRY_APPROACHING to supervisors for approaching holds', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildApproachingHold()]);
      notificationFindMany.mockResolvedValue([]);

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.ACCESS_RETRY_APPROACHING,
        expect.any(String),
        expect.stringContaining('WO-2026-001'),
        'WorkOrder',
        'wo-1',
      );
    });

    it('skips holds already notified within dedup window', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildApproachingHold({ workOrderId: 'wo-already-notified' })]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-already-notified' }]);

      await job.run();

      expect(notifications.notifySupervisors).not.toHaveBeenCalled();
    });

    it('only notifies WOs not in already-notified set', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany } = buildMocks();
      const hold1 = buildApproachingHold({ workOrderId: 'wo-1' });
      const hold2 = buildApproachingHold({ id: 'hold-2', workOrderId: 'wo-2' });
      (hold2 as Record<string, unknown>).workOrder = { referenceNumber: 'WO-2026-002' };
      onHoldFindMany.mockResolvedValue([hold1, hold2]);
      notificationFindMany.mockResolvedValue([{ entityId: 'wo-1' }]);

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      expect(notifications.notifySupervisors).toHaveBeenCalledWith(
        NotificationType.ACCESS_RETRY_APPROACHING,
        expect.any(String),
        expect.stringContaining('WO-2026-002'),
        'WorkOrder',
        'wo-2',
      );
    });

    it('queries hold periods with ACCESS_DENIED, resumedAt: null, retryDate in [now, now+24h]', async () => {
      const { job, onHoldFindMany } = buildMocks();

      const before = new Date();
      await job.run();
      const after = new Date();

      const holdQuery = onHoldFindMany.mock.calls[0][0] as {
        where: {
          reasonType: string;
          resumedAt: null;
          retryDate: { gte: Date; lte: Date };
        };
      };

      expect(holdQuery.where.reasonType).toBe(OnHoldReasonType.ACCESS_DENIED);
      expect(holdQuery.where.resumedAt).toBeNull();

      const gteDate = holdQuery.where.retryDate.gte.getTime();
      expect(gteDate).toBeGreaterThanOrEqual(before.getTime() - 100);
      expect(gteDate).toBeLessThanOrEqual(after.getTime() + 100);

      const lteDate = holdQuery.where.retryDate.lte.getTime();
      const expectedLteMin = before.getTime() + 24 * 60 * 60 * 1000;
      const expectedLteMax = after.getTime() + 24 * 60 * 60 * 1000;
      expect(lteDate).toBeGreaterThanOrEqual(expectedLteMin - 100);
      expect(lteDate).toBeLessThanOrEqual(expectedLteMax + 100);
    });

    it('dedup query uses 23h lookback window and targets ACCESS_RETRY_APPROACHING type', async () => {
      const { job, onHoldFindMany, notificationFindMany } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildApproachingHold()]);
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

      expect(notifQuery.where.type).toBe(NotificationType.ACCESS_RETRY_APPROACHING);
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
      onHoldFindMany.mockResolvedValue([buildApproachingHold()]);
      notificationFindMany.mockResolvedValue([]);
      (notifications.notifySupervisors as jest.Mock).mockRejectedValueOnce(new Error('transport down'));

      await expect(job.run()).rejects.toThrow('transport down');
    });
  });

  describe('job lifecycle logging (§4.1)', () => {
    it('calls recordStart with "access-retry-approaching"', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordStart).toHaveBeenCalledWith('access-retry-approaching');
    });

    it('calls recordSuccess on successful execution', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordSuccess).toHaveBeenCalledWith('access-retry-approaching');
      expect(jobLogger.recordFailure).not.toHaveBeenCalled();
    });

    it('calls recordFailure and re-throws on error', async () => {
      const { job, notifications, onHoldFindMany, notificationFindMany, jobLogger } = buildMocks();
      onHoldFindMany.mockResolvedValue([buildApproachingHold()]);
      notificationFindMany.mockResolvedValue([]);
      const err = new Error('dispatch failure');
      (notifications.notifySupervisors as jest.Mock).mockRejectedValueOnce(err);

      await expect(job.run()).rejects.toThrow('dispatch failure');
      expect(jobLogger.recordFailure).toHaveBeenCalledWith('access-retry-approaching', err);
      expect(jobLogger.recordSuccess).not.toHaveBeenCalled();
    });
  });
});
