/**
 * Unit tests for FailedNotificationDetectorJob (§1.16)
 *
 * Covers:
 * - run(): calls jobLogger.recordStart / recordSuccess on success
 * - run(): calls jobLogger.recordFailure and re-throws on doRun failure
 * - doRun: notifies admins with NOTIFICATION_DELIVERY_FAILED when failedCount > 0 and no dedup entry
 * - doRun: skips notification when failedCount is 0
 * - doRun: skips notification when a recent NOTIFICATION_DELIVERY_FAILED already exists (dedup)
 * - doRun: queries prisma.notification.count with correct 23h window filter for emailFailed
 * - doRun: dedup check uses correct type, entityType, entityId filters
 */

import { FailedNotificationDetectorJob } from './failed-notification-detector.job';
import { NotificationType } from '@gmao/db';

function buildMocks() {
  const notificationCount = jest.fn().mockResolvedValue(0);
  const notificationFindFirst = jest.fn().mockResolvedValue(null);
  const prisma = {
    notification: { count: notificationCount, findFirst: notificationFindFirst },
  };

  const notifyAdmins = jest.fn().mockResolvedValue(undefined);
  const notifications = { notifyAdmins };

  const recordStart = jest.fn().mockResolvedValue(undefined);
  const recordSuccess = jest.fn().mockResolvedValue(undefined);
  const recordFailure = jest.fn().mockResolvedValue(undefined);
  const jobLogger = { recordStart, recordSuccess, recordFailure };

  const job = new FailedNotificationDetectorJob(
    prisma as never,
    notifications as never,
    jobLogger as never,
  );

  return { job, notificationCount, notificationFindFirst, notifyAdmins, recordStart, recordSuccess, recordFailure };
}

describe('FailedNotificationDetectorJob', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── run() orchestration ───────────────────────────────────────────────────

  describe('run()', () => {
    it('calls recordStart and recordSuccess on successful execution', async () => {
      const { job, recordStart, recordSuccess, recordFailure } = buildMocks();

      await job.run();

      expect(recordStart).toHaveBeenCalledWith('failed-notification-detector');
      expect(recordSuccess).toHaveBeenCalledWith('failed-notification-detector');
      expect(recordFailure).not.toHaveBeenCalled();
    });

    it('calls recordFailure and re-throws when doRun throws', async () => {
      const { job, recordStart, recordSuccess, recordFailure, notificationCount } = buildMocks();
      const error = new Error('prisma connection refused');
      notificationCount.mockRejectedValueOnce(error);

      await expect(job.run()).rejects.toThrow('prisma connection refused');

      expect(recordStart).toHaveBeenCalledWith('failed-notification-detector');
      expect(recordFailure).toHaveBeenCalledWith('failed-notification-detector', error);
      expect(recordSuccess).not.toHaveBeenCalled();
    });
  });

  // ── doRun() — skip when no failures ──────────────────────────────────────

  describe('doRun() — no email failures', () => {
    it('does NOT call notifyAdmins when failedCount is 0', async () => {
      const { job, notificationCount, notifyAdmins } = buildMocks();
      notificationCount.mockResolvedValueOnce(0);

      await job.run();

      expect(notifyAdmins).not.toHaveBeenCalled();
    });

    it('counts emailFailed:true notifications within 23h window', async () => {
      const { job, notificationCount } = buildMocks();
      notificationCount.mockResolvedValueOnce(0);

      const before = Date.now() - 23 * 60 * 60 * 1000;
      await job.run();

      const countCall = notificationCount.mock.calls[0][0] as {
        where: { emailFailed: boolean; createdAt: { gte: Date } };
      };
      expect(countCall.where.emailFailed).toBe(true);
      expect(countCall.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  // ── doRun() — notify when failures found ─────────────────────────────────

  describe('doRun() — email failures present', () => {
    it('calls notifyAdmins with NOTIFICATION_DELIVERY_FAILED when failures exist and no dedup entry', async () => {
      const { job, notificationCount, notificationFindFirst, notifyAdmins } = buildMocks();
      notificationCount.mockResolvedValueOnce(7);
      notificationFindFirst.mockResolvedValueOnce(null);

      await job.run();

      expect(notifyAdmins).toHaveBeenCalledWith(
        NotificationType.NOTIFICATION_DELIVERY_FAILED,
        'Échecs de livraison de notifications',
        expect.stringContaining('7'),
        'system',
        'email-delivery',
      );
    });

    it('includes the failure count in the notification summary', async () => {
      const { job, notificationCount, notificationFindFirst, notifyAdmins } = buildMocks();
      notificationCount.mockResolvedValueOnce(42);
      notificationFindFirst.mockResolvedValueOnce(null);

      await job.run();

      const summary: string = notifyAdmins.mock.calls[0][2];
      expect(summary).toContain('42');
    });

    it('skips notification when a NOTIFICATION_DELIVERY_FAILED already exists within 23h (dedup)', async () => {
      const { job, notificationCount, notificationFindFirst, notifyAdmins } = buildMocks();
      notificationCount.mockResolvedValueOnce(3);
      notificationFindFirst.mockResolvedValueOnce({ id: 'existing-dedup' });

      await job.run();

      expect(notifyAdmins).not.toHaveBeenCalled();
    });

    it('dedup query uses correct type, entityType, entityId, and 23h window', async () => {
      const { job, notificationCount, notificationFindFirst } = buildMocks();
      notificationCount.mockResolvedValueOnce(2);
      notificationFindFirst.mockResolvedValueOnce({ id: 'found' });

      const before = Date.now() - 23 * 60 * 60 * 1000;
      await job.run();

      const dedupCall = notificationFindFirst.mock.calls[0][0] as {
        where: {
          type: string;
          entityType: string;
          entityId: string;
          createdAt: { gte: Date };
        };
      };
      expect(dedupCall.where.type).toBe(NotificationType.NOTIFICATION_DELIVERY_FAILED);
      expect(dedupCall.where.entityType).toBe('system');
      expect(dedupCall.where.entityId).toBe('email-delivery');
      expect(dedupCall.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('does NOT call prisma.notification.findFirst when failedCount is 0', async () => {
      const { job, notificationCount, notificationFindFirst } = buildMocks();
      notificationCount.mockResolvedValueOnce(0);

      await job.run();

      expect(notificationFindFirst).not.toHaveBeenCalled();
    });
  });
});
