/**
 * Unit tests for JobLoggerService (§4.1 + §1.16)
 *
 * Covers:
 * - recordStart: upserts record with lastRunAt=now, create and update paths
 * - recordSuccess: upserts record with lastSuccessAt=now
 * - recordFailure: upserts record with lastFailureAt=now and truncated message
 * - recordFailure: truncates message longer than 500 chars
 * - recordFailure: swallows DB errors without throwing
 * - recordFailure (§1.16): calls notifyAdmins with SCHEDULED_JOB_FAILED when no recent dedup entry
 * - recordFailure (§1.16): skips notification when a SCHEDULED_JOB_FAILED was already sent in 23h window
 * - recordFailure (§1.16): skips notification when NotificationsService is not injected (@Optional)
 * - getAll: returns rows ordered by jobName asc
 */

import { JobLoggerService } from './job-logger.service';
import { NotificationType } from '@gmao/db';

function buildMocks(withNotifications = true) {
  const upsert = jest.fn().mockResolvedValue({});
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue(null);
  const prisma = {
    scheduledJobLog: { upsert, findMany },
    notification: { findFirst },
  };

  const notifyAdmins = jest.fn().mockResolvedValue(undefined);
  const notifications = withNotifications ? { notifyAdmins } : null;

  const service = new JobLoggerService(prisma as never, notifications as never);
  return { service, upsert, findMany, findFirst, notifyAdmins };
}

describe('JobLoggerService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── recordStart ──────────────────────────────────────────────────────────

  describe('recordStart()', () => {
    it('upserts with lastRunAt=now for the given jobName', async () => {
      const { service, upsert } = buildMocks();
      const before = new Date();
      await service.recordStart('test-job');
      const after = new Date();

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0] as {
        where: { jobName: string };
        create: { jobName: string; lastRunAt: Date };
        update: { lastRunAt: Date };
      };
      expect(call.where.jobName).toBe('test-job');
      expect(call.create.jobName).toBe('test-job');
      expect(call.create.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.create.lastRunAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(call.update.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.update.lastRunAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('swallows DB errors without throwing', async () => {
      const { service, upsert } = buildMocks();
      upsert.mockRejectedValueOnce(new Error('DB connection lost'));
      await expect(service.recordStart('test-job')).resolves.toBeUndefined();
    });
  });

  // ── recordSuccess ─────────────────────────────────────────────────────────

  describe('recordSuccess()', () => {
    it('upserts with lastSuccessAt=now', async () => {
      const { service, upsert } = buildMocks();
      const before = new Date();
      await service.recordSuccess('test-job');
      const after = new Date();

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0] as {
        update: { lastSuccessAt: Date };
        create: { lastSuccessAt: Date };
      };
      expect(call.update.lastSuccessAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.update.lastSuccessAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(call.create.lastSuccessAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('swallows DB errors without throwing', async () => {
      const { service, upsert } = buildMocks();
      upsert.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.recordSuccess('test-job')).resolves.toBeUndefined();
    });
  });

  // ── recordFailure — persistence ───────────────────────────────────────────

  describe('recordFailure() — persistence', () => {
    it('upserts with lastFailureAt=now and the error message', async () => {
      const { service, upsert } = buildMocks();
      const before = new Date();
      await service.recordFailure('test-job', new Error('something went wrong'));
      const after = new Date();

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0] as {
        update: { lastFailureAt: Date; lastErrorMessage: string };
        create: { lastErrorMessage: string; lastFailureAt: Date };
      };
      expect(call.update.lastFailureAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.update.lastFailureAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(call.update.lastErrorMessage).toBe('something went wrong');
      expect(call.create.lastErrorMessage).toBe('something went wrong');
    });

    it('truncates error messages longer than 500 characters', async () => {
      const { service, upsert } = buildMocks();
      const longMessage = 'x'.repeat(600);
      await service.recordFailure('test-job', new Error(longMessage));

      const call = upsert.mock.calls[0][0] as {
        update: { lastErrorMessage: string };
      };
      expect(call.update.lastErrorMessage).toHaveLength(500);
    });

    it('swallows DB errors without throwing', async () => {
      const { service, upsert } = buildMocks();
      upsert.mockRejectedValueOnce(new Error('deadlock'));
      await expect(
        service.recordFailure('test-job', new Error('original error')),
      ).resolves.toBeUndefined();
    });
  });

  // ── recordFailure — admin notifications (§1.16) ───────────────────────────

  describe('recordFailure() — SCHEDULED_JOB_FAILED admin notification (§1.16)', () => {
    it('calls notifyAdmins with SCHEDULED_JOB_FAILED when no recent dedup entry exists', async () => {
      const { service, findFirst, notifyAdmins } = buildMocks();
      findFirst.mockResolvedValueOnce(null); // no recent notification

      await service.recordFailure('my-cron-job', new Error('db timeout'));

      expect(notifyAdmins).toHaveBeenCalledWith(
        NotificationType.SCHEDULED_JOB_FAILED,
        'Échec de tâche planifiée',
        expect.stringContaining('my-cron-job'),
        'ScheduledJob',
        'my-cron-job',
      );
      expect(notifyAdmins).toHaveBeenCalledWith(
        NotificationType.SCHEDULED_JOB_FAILED,
        expect.any(String),
        expect.stringContaining('db timeout'),
        expect.any(String),
        expect.any(String),
      );
    });

    it('passes the (possibly truncated) error message in the notification summary', async () => {
      const { service, findFirst, notifyAdmins } = buildMocks();
      findFirst.mockResolvedValueOnce(null);
      const longMsg = 'z'.repeat(600);

      await service.recordFailure('job-x', new Error(longMsg));

      const summaryArg: string = notifyAdmins.mock.calls[0][2];
      expect(summaryArg.length).toBeLessThanOrEqual(
        'La tâche planifiée « job-x » a échoué : '.length + 500 + 10,
      );
    });

    it('skips notification when SCHEDULED_JOB_FAILED already sent within 23h window', async () => {
      const { service, findFirst, notifyAdmins } = buildMocks();
      findFirst.mockResolvedValueOnce({ id: 'existing-notif-id' });

      await service.recordFailure('throttled-job', new Error('err'));

      expect(notifyAdmins).not.toHaveBeenCalled();
    });

    it('queries dedup with correct filters (type, entityType, entityId, 23h window)', async () => {
      const { service, findFirst } = buildMocks();
      findFirst.mockResolvedValueOnce(null);

      const before = Date.now() - 23 * 60 * 60 * 1000;
      await service.recordFailure('dedup-job', new Error('err'));

      const dedupCall = findFirst.mock.calls[0][0] as {
        where: {
          type: string;
          entityType: string;
          entityId: string;
          createdAt: { gte: Date };
        };
      };
      expect(dedupCall.where.type).toBe(NotificationType.SCHEDULED_JOB_FAILED);
      expect(dedupCall.where.entityType).toBe('ScheduledJob');
      expect(dedupCall.where.entityId).toBe('dedup-job');
      expect(dedupCall.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('skips notification entirely when NotificationsService is not injected (@Optional)', async () => {
      const { service, notifyAdmins } = buildMocks(false); // no notifications service

      await expect(
        service.recordFailure('unnotified-job', new Error('boom')),
      ).resolves.toBeUndefined();

      expect(notifyAdmins).not.toHaveBeenCalled();
    });
  });

  // ── getAll ────────────────────────────────────────────────────────────────

  describe('getAll()', () => {
    it('returns all job logs ordered by jobName ascending', async () => {
      const { service, findMany } = buildMocks();
      const rows = [
        { jobName: 'access-retry-approaching', lastRunAt: null, lastSuccessAt: null, lastFailureAt: null, lastErrorMessage: null },
        { jobName: 'daily-summary', lastRunAt: new Date(), lastSuccessAt: new Date(), lastFailureAt: null, lastErrorMessage: null },
      ];
      findMany.mockResolvedValueOnce(rows);

      const result = await service.getAll();
      expect(result).toEqual(rows);
      expect(findMany).toHaveBeenCalledWith({ orderBy: { jobName: 'asc' } });
    });

    it('returns empty array when no logs exist', async () => {
      const { service } = buildMocks();
      const result = await service.getAll();
      expect(result).toEqual([]);
    });
  });
});
