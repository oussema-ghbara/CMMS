/**
 * Unit tests for AdminAnalyticsService
 *
 * Covers:
 * getUserActivityStats():
 * - Wraps all 10 user count queries in a single $transaction
 * - Maps positional transaction results to all stat fields correctly
 * - loginRecency maps all 5 buckets (last7, 7-30, 30-90, >90, never)
 * - loginRecency.never equals neverLoggedIn
 * - byRole iterates every Role enum value exactly once
 * - byRole queries filter by isActive: true
 * - inactiveLast30Days query uses correct lt threshold (~30 days ago)
 * - inactiveLast90Days query uses correct lt threshold (~90 days ago)
 * - All counts of 0 produce correct zero stats (boundary)
 *
 * getSystemHealthStats():
 * - Calls getJobCounts on all 3 queues in parallel
 * - Returns exactly 3 queue entries named correctly
 * - Maps queue counts for each field per queue
 * - Uses ?? 0 fallback when queue returns undefined for a state
 * - Wraps notification count queries in a single $transaction
 * - Maps emailFailed, emailPendingDelivery, totalSentLast24h correctly
 * - emailPendingDelivery query uses emailSent:false AND emailFailed:false
 * - totalSentLast24h query uses emailSentAt gte ~24h ago
 */

import { AdminAnalyticsService } from './admin-analytics.service';
import { Role } from '@gmao/db';
import { MAIL_QUEUE } from '../mail/mail.constants';
import { REPORT_GENERATION_QUEUE } from '../work-orders/jobs/report-generation.constants';
import { PREVENTIVE_PLAN_QUEUE } from '../preventive-plans/preventive-plans.constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePositionalMock(values: number[]) {
  let i = 0;
  return jest.fn().mockImplementation(() => Promise.resolve(values[i++] ?? 0));
}

function makeQueue(counts: Partial<Record<string, number>> = {}) {
  return {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      failed: 0,
      completed: 0,
      delayed: 0,
      ...counts,
    }),
  };
}

function buildMocks(
  userCounts: number[] = [10, 8, 2, 3, 2, 1, 4, 2, 1, 1],
  notifCounts: number[] = [5, 3, 12],
  queueOverrides: {
    mail?: Partial<Record<string, number>>;
    report?: Partial<Record<string, number>>;
    plan?: Partial<Record<string, number>>;
  } = {},
) {
  const userCountMock = makePositionalMock(userCounts);
  const notifCountMock = makePositionalMock(notifCounts);

  const prisma = {
    user: { count: userCountMock },
    notification: { count: notifCountMock },
    $transaction: jest
      .fn()
      .mockImplementation((queries: Promise<number>[]) => Promise.all(queries)),
  };

  const mailQueue = makeQueue(queueOverrides.mail ?? { waiting: 2, active: 1, failed: 0, completed: 100, delayed: 0 });
  const reportQueue = makeQueue(queueOverrides.report ?? { waiting: 0, active: 0, failed: 1, completed: 50, delayed: 2 });
  const planQueue = makeQueue(queueOverrides.plan ?? { waiting: 5, active: 2, failed: 0, completed: 200, delayed: 1 });

  const service = new AdminAnalyticsService(
    prisma as never,
    mailQueue as never,
    reportQueue as never,
    planQueue as never,
  );

  return { service, prisma, userCountMock, notifCountMock, mailQueue, reportQueue, planQueue };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminAnalyticsService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getUserActivityStats ──────────────────────────────────────────────────

  describe('getUserActivityStats()', () => {
    it('wraps all 10 user count queries in one $transaction', async () => {
      const { service, prisma } = buildMocks();

      await service.getUserActivityStats();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg: unknown[] = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(txArg).toHaveLength(10);
    });

    it('maps positional transaction results to all top-level stat fields', async () => {
      const { service } = buildMocks([10, 8, 2, 3, 2, 1, 4, 2, 1, 1]);

      const stats = await service.getUserActivityStats();

      expect(stats.totalUsers).toBe(10);
      expect(stats.activeUsers).toBe(8);
      expect(stats.inactiveAccounts).toBe(2);
      expect(stats.neverLoggedIn).toBe(3);
      expect(stats.inactiveLast30Days).toBe(2);
      expect(stats.inactiveLast90Days).toBe(1);
    });

    it('maps all 5 loginRecency buckets correctly', async () => {
      const { service } = buildMocks([10, 8, 2, 3, 2, 1, 4, 2, 1, 1]);

      const stats = await service.getUserActivityStats();

      expect(stats.loginRecency.last7Days).toBe(4);
      expect(stats.loginRecency.last7To30Days).toBe(2);
      expect(stats.loginRecency.last30To90Days).toBe(1);
      expect(stats.loginRecency.over90Days).toBe(1);
      expect(stats.loginRecency.never).toBe(3);
    });

    it('loginRecency.never equals neverLoggedIn (same query result)', async () => {
      const { service } = buildMocks([10, 8, 2, 7, 2, 1, 4, 2, 1, 1]);

      const stats = await service.getUserActivityStats();

      expect(stats.loginRecency.never).toBe(stats.neverLoggedIn);
      expect(stats.loginRecency.never).toBe(7);
    });

    it('queries one count per Role enum value for byRole', async () => {
      const { service, userCountMock } = buildMocks();

      await service.getUserActivityStats();

      const roleCount = Object.values(Role).length;
      // 10 in $transaction + one per role outside it
      expect(userCountMock).toHaveBeenCalledTimes(10 + roleCount);
    });

    it('byRole has exactly one entry per Role value', async () => {
      const { service } = buildMocks();

      const stats = await service.getUserActivityStats();

      const roles = Object.values(Role);
      expect(stats.byRole).toHaveLength(roles.length);
      for (const role of roles) {
        expect(stats.byRole.some((r) => r.role === role)).toBe(true);
      }
    });

    it('each byRole query filters by isActive: true', async () => {
      const { service, userCountMock } = buildMocks();

      await service.getUserActivityStats();

      const roleCount = Object.values(Role).length;
      const roleCalls = userCountMock.mock.calls.slice(10, 10 + roleCount);
      for (const [arg] of roleCalls) {
        expect(arg).toMatchObject({ where: expect.objectContaining({ isActive: true }) });
      }
    });

    it('inactiveLast30Days query (position 4) uses lt threshold ~30 days ago', async () => {
      const { service, userCountMock } = buildMocks();

      const before = Date.now();
      await service.getUserActivityStats();
      const after = Date.now();

      const txCalls: Array<{ where: Record<string, unknown> }> =
        userCountMock.mock.calls.slice(0, 10).map(([a]) => a);
      const query = txCalls[4];
      const lt = (query.where.lastLoginAt as { lt: Date }).lt;

      const expected = before - 30 * 24 * 60 * 60 * 1000;
      expect(lt.getTime()).toBeGreaterThanOrEqual(expected - 1000);
      expect(lt.getTime()).toBeLessThanOrEqual(after);
    });

    it('inactiveLast90Days query (position 5) uses lt threshold ~90 days ago', async () => {
      const { service, userCountMock } = buildMocks();

      const before = Date.now();
      await service.getUserActivityStats();
      const after = Date.now();

      const txCalls: Array<{ where: Record<string, unknown> }> =
        userCountMock.mock.calls.slice(0, 10).map(([a]) => a);
      const query = txCalls[5];
      const lt = (query.where.lastLoginAt as { lt: Date }).lt;

      const expected = before - 90 * 24 * 60 * 60 * 1000;
      expect(lt.getTime()).toBeGreaterThanOrEqual(expected - 1000);
      expect(lt.getTime()).toBeLessThanOrEqual(after);
    });

    it('handles all-zero counts without throwing', async () => {
      const { service } = buildMocks(Array(10).fill(0));

      const stats = await service.getUserActivityStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.loginRecency.last7Days).toBe(0);
      expect(stats.loginRecency.never).toBe(0);
    });
  });

  // ── getSystemHealthStats ──────────────────────────────────────────────────

  describe('getSystemHealthStats()', () => {
    it('calls getJobCounts on all 3 queues', async () => {
      const { service, mailQueue, reportQueue, planQueue } = buildMocks();

      await service.getSystemHealthStats();

      expect(mailQueue.getJobCounts).toHaveBeenCalledTimes(1);
      expect(reportQueue.getJobCounts).toHaveBeenCalledTimes(1);
      expect(planQueue.getJobCounts).toHaveBeenCalledTimes(1);
    });

    it('requests waiting/active/failed/completed/delayed from each queue', async () => {
      const { service, mailQueue } = buildMocks();

      await service.getSystemHealthStats();

      expect(mailQueue.getJobCounts).toHaveBeenCalledWith(
        'waiting',
        'active',
        'failed',
        'completed',
        'delayed',
      );
    });

    it('returns exactly 3 queue entries', async () => {
      const { service } = buildMocks();

      const stats = await service.getSystemHealthStats();

      expect(stats.queues).toHaveLength(3);
    });

    it('names the queue entries with the correct queue name constants', async () => {
      const { service } = buildMocks();

      const stats = await service.getSystemHealthStats();

      const names = stats.queues.map((q) => q.name);
      expect(names).toContain(MAIL_QUEUE);
      expect(names).toContain(REPORT_GENERATION_QUEUE);
      expect(names).toContain(PREVENTIVE_PLAN_QUEUE);
    });

    it('maps mail queue counts correctly', async () => {
      const { service } = buildMocks(undefined, undefined, {
        mail: { waiting: 2, active: 1, failed: 3, completed: 100, delayed: 4 },
      });

      const stats = await service.getSystemHealthStats();

      const mail = stats.queues.find((q) => q.name === MAIL_QUEUE)!;
      expect(mail.waiting).toBe(2);
      expect(mail.active).toBe(1);
      expect(mail.failed).toBe(3);
      expect(mail.completed).toBe(100);
      expect(mail.delayed).toBe(4);
    });

    it('maps report queue counts correctly', async () => {
      const { service } = buildMocks(undefined, undefined, {
        report: { waiting: 0, active: 0, failed: 2, completed: 50, delayed: 1 },
      });

      const stats = await service.getSystemHealthStats();

      const report = stats.queues.find((q) => q.name === REPORT_GENERATION_QUEUE)!;
      expect(report.failed).toBe(2);
      expect(report.delayed).toBe(1);
    });

    it('falls back to 0 when a queue state is absent from getJobCounts result', async () => {
      const prisma = {
        user: { count: jest.fn() },
        notification: { count: makePositionalMock([5, 3, 12]) },
        $transaction: jest
          .fn()
          .mockImplementation((qs: Promise<number>[]) => Promise.all(qs)),
      };
      const emptyQueue = { getJobCounts: jest.fn().mockResolvedValue({}) };
      const service = new AdminAnalyticsService(
        prisma as never,
        emptyQueue as never,
        emptyQueue as never,
        emptyQueue as never,
      );

      const stats = await service.getSystemHealthStats();

      for (const queue of stats.queues) {
        expect(queue.waiting).toBe(0);
        expect(queue.active).toBe(0);
        expect(queue.failed).toBe(0);
        expect(queue.completed).toBe(0);
        expect(queue.delayed).toBe(0);
      }
    });

    it('wraps 3 notification count queries in one $transaction', async () => {
      const { service, prisma } = buildMocks();

      await service.getSystemHealthStats();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg: unknown[] = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(txArg).toHaveLength(3);
    });

    it('maps notification stats correctly', async () => {
      const { service } = buildMocks(undefined, [7, 4, 15]);

      const stats = await service.getSystemHealthStats();

      expect(stats.notifications.emailFailed).toBe(7);
      expect(stats.notifications.emailPendingDelivery).toBe(4);
      expect(stats.notifications.totalSentLast24h).toBe(15);
    });

    it('emailPendingDelivery query (position 1) filters emailSent:false AND emailFailed:false', async () => {
      const { service, notifCountMock } = buildMocks();

      await service.getSystemHealthStats();

      const txCalls: Array<{ where: Record<string, unknown> }> =
        notifCountMock.mock.calls.slice(0, 3).map(([a]) => a);
      expect(txCalls[1].where).toMatchObject({ emailSent: false, emailFailed: false });
    });

    it('totalSentLast24h query (position 2) uses emailSentAt gte ~24h ago', async () => {
      const { service, notifCountMock } = buildMocks();

      const before = Date.now();
      await service.getSystemHealthStats();
      const after = Date.now();

      const txCalls: Array<{ where: Record<string, unknown> }> =
        notifCountMock.mock.calls.slice(0, 3).map(([a]) => a);
      const gte = (txCalls[2].where.emailSentAt as { gte: Date }).gte;

      const expected24hAgo = before - 24 * 60 * 60 * 1000;
      expect(gte.getTime()).toBeGreaterThanOrEqual(expected24hAgo - 1000);
      expect(gte.getTime()).toBeLessThanOrEqual(after);
    });

    it('totalSentLast24h query requires emailSent: true', async () => {
      const { service, notifCountMock } = buildMocks();

      await service.getSystemHealthStats();

      const txCalls: Array<{ where: Record<string, unknown> }> =
        notifCountMock.mock.calls.slice(0, 3).map(([a]) => a);
      expect(txCalls[2].where).toMatchObject({ emailSent: true });
    });
  });
});
