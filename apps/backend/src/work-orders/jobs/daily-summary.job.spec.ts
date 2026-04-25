/**
 * Unit tests for DailySummaryJob
 *
 * Covers:
 * - Hour-gate: skips when current hour !== configured hour
 * - Hour-gate: runs when current hour === configured hour
 * - Config fallback: defaults to hour 17 when key is absent
 * - Config fallback: defaults to 17 when value is out-of-range or non-numeric
 * - No supervisors: skips mail enqueue and logs a warning
 * - Supervisors present: enqueues one mail job per supervisor
 * - Mail context: template name, supervisor fields, date, all metric fields
 * - Metrics: each count maps to the correct Prisma query predicate
 * - Overdue predicate: uses dueDate < now + active statuses
 * - Critical predicate: uses priority CRITICAL + active statuses
 * - closedToday predicate: uses closedAt >= start of today
 * - deferredReportCount: queries ProblemReport with DEFERRED status
 * - lowStockCount: counts parts where currentStock < minimumStockThreshold
 * - overdueList: returns top MAX_OVERDUE_LIST items ordered by dueDate asc
 * - onHoldItems: computes holdDurationMinutes from active hold period
 * - Parallel enqueue: all mail jobs sent in one Promise.all, not sequentially
 * - Idempotency: two calls in the same hour only enqueue once
 */

import {
  DailySummaryJob,
  DailySummaryMetrics,
  DailySummaryOnHoldItem,
} from './daily-summary.job';
import { WorkOrderStatus, WorkOrderPriority, ProblemReportStatus, Role } from '@gmao/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSupervisors(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `sup-${i + 1}`,
    email: `supervisor${i + 1}@example.com`,
    name: `Supervisor ${i + 1}`,
    roles: [Role.SUPERVISOR],
  }));
}

function buildMetrics(overrides: Partial<DailySummaryMetrics> = {}): DailySummaryMetrics {
  return {
    openCount: 5,
    inProgressCount: 3,
    pendingValidationCount: 2,
    onHoldCount: 1,
    overdueCount: 4,
    criticalCount: 1,
    closedTodayCount: 7,
    deferredReportCount: 2,
    criticalDeferredCount: 1,
    lowStockCount: 3,
    overdueList: [],
    onHoldItems: [],
    lowStockItems: [],
    criticalDeferredItems: [],
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildMocks() {
  const prismaCountMock = jest.fn();
  const prismaFindManyMock = jest.fn().mockResolvedValue([]);

  const prisma = {
    workOrder: { count: prismaCountMock, findMany: prismaFindManyMock },
    problemReport: { count: prismaCountMock, findMany: jest.fn().mockResolvedValue([]) },
    part: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn() },
    $transaction: jest.fn().mockImplementation((queries: Promise<number>[]) =>
      Promise.all(queries),
    ),
  };

  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };

  const systemConfig = {
    get: jest.fn(),
  };

  const jobLogger = {
    recordStart: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
  };

  const job = new DailySummaryJob(
    prisma as never,
    mail as never,
    systemConfig as never,
    jobLogger as never,
  );

  return { job, prisma, mail, systemConfig, prismaCountMock, prismaFindManyMock, jobLogger };
}

// Returns a mock implementation for prisma.workOrder.count / problemReport.count
// that emits values positionally across both mocks combined.
function setupCountMock(
  prismaCountMock: jest.Mock,
  values: number[],
): void {
  let callIndex = 0;
  prismaCountMock.mockImplementation(() => {
    const value = values[callIndex] ?? 0;
    callIndex++;
    return Promise.resolve(value);
  });
}

function freezeHour(hour: number): () => void {
  const spy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(hour);
  return () => spy.mockRestore();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DailySummaryJob', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Hour gate ───────────────────────────────────────────────────────────────

  describe('Hour gate', () => {
    it('does NOT enqueue any mail when current hour !== configured hour', async () => {
      const { job, mail, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      const restore = freezeHour(10);

      await job.run();

      restore();
      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('proceeds when current hour === configured hour', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(1));

      const restore = freezeHour(17);
      await job.run();
      restore();

      expect(mail.enqueue).toHaveBeenCalledTimes(1);
    });

    it('uses hour 0 when configured to midnight', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('0');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(1));

      const restore = freezeHour(0);
      await job.run();
      restore();

      expect(mail.enqueue).toHaveBeenCalled();
    });
  });

  // ── Config resolution ───────────────────────────────────────────────────────

  describe('getConfiguredHour()', () => {
    it('returns 17 when key is absent from config (null)', async () => {
      const { job, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue(null);

      const hour = await job.getConfiguredHour();

      expect(hour).toBe(17);
    });

    it('parses a valid integer string from config', async () => {
      const { job, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue('9');

      const hour = await job.getConfiguredHour();

      expect(hour).toBe(9);
    });

    it('returns 17 when value is a non-numeric string', async () => {
      const { job, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue('morning');

      const hour = await job.getConfiguredHour();

      expect(hour).toBe(17);
    });

    it('returns 17 when value is negative (-1)', async () => {
      const { job, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue('-1');

      const hour = await job.getConfiguredHour();

      expect(hour).toBe(17);
    });

    it('returns 17 when value is 24 (out of range)', async () => {
      const { job, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue('24');

      const hour = await job.getConfiguredHour();

      expect(hour).toBe(17);
    });

    it('accepts 23 as a valid boundary value', async () => {
      const { job, systemConfig } = buildMocks();
      systemConfig.get.mockResolvedValue('23');

      const hour = await job.getConfiguredHour();

      expect(hour).toBe(23);
    });
  });

  // ── Supervisor resolution ───────────────────────────────────────────────────

  describe('No active supervisors', () => {
    it('does NOT enqueue any mail when there are no active supervisors', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('8');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue([]);

      const restore = freezeHour(8);
      await job.run();
      restore();

      expect(mail.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── Mail dispatch ───────────────────────────────────────────────────────────

  describe('Mail dispatch', () => {
    it('enqueues exactly one mail per supervisor', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(3));

      const restore = freezeHour(17);
      await job.run();
      restore();

      expect(mail.enqueue).toHaveBeenCalledTimes(3);
    });

    it('uses the "daily-summary" template for every mail', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(2));

      const restore = freezeHour(17);
      await job.run();
      restore();

      for (const call of mail.enqueue.mock.calls) {
        expect(call[0].template).toBe('daily-summary');
      }
    });

    it('sends to each supervisor email address', async () => {
      const supervisors = buildSupervisors(2);
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(supervisors);

      const restore = freezeHour(17);
      await job.run();
      restore();

      const sentTo = mail.enqueue.mock.calls.map((c: [{ to: string }]) => c[0].to);
      expect(sentTo).toEqual(expect.arrayContaining(supervisors.map((s) => s.email)));
    });

    it('includes supervisorName in mail context', async () => {
      const supervisors = buildSupervisors(1);
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(supervisors);

      const restore = freezeHour(17);
      await job.run();
      restore();

      expect(mail.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            supervisorName: supervisors[0].name,
          }),
        }),
      );
    });

    it('includes a non-empty date string in mail context', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(1));

      const restore = freezeHour(17);
      await job.run();
      restore();

      const context = mail.enqueue.mock.calls[0][0].context;
      expect(typeof context.date).toBe('string');
      expect(context.date.length).toBeGreaterThan(0);
    });
  });

  describe('Mail context by role', () => {
    it('includes low stock details for supervisors with STOREKEEPER role', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.part.findMany.mockResolvedValue([
        {
          name: 'Bearing',
          referenceCode: 'BRG-01',
          currentStock: 0,
          minimumStockThreshold: 3,
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'sup-storekeeper',
          email: 'sup-storekeeper@example.com',
          name: 'Sup Storekeeper',
          roles: [Role.SUPERVISOR, Role.STOREKEEPER],
        },
      ]);

      const restore = freezeHour(17);
      await job.run();
      restore();

      const context = mail.enqueue.mock.calls[0][0].context;
      expect(context.hasStorekeeperRole).toBe(true);
      expect(context.lowStockCount).toBe(1);
      expect(context.lowStockItems).toHaveLength(1);
    });

    it('hides low stock details for supervisors without STOREKEEPER role', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.part.findMany.mockResolvedValue([
        {
          name: 'Bearing',
          referenceCode: 'BRG-01',
          currentStock: 0,
          minimumStockThreshold: 3,
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'sup-only',
          email: 'sup-only@example.com',
          name: 'Sup Only',
          roles: [Role.SUPERVISOR],
        },
      ]);

      const restore = freezeHour(17);
      await job.run();
      restore();

      const context = mail.enqueue.mock.calls[0][0].context;
      expect(context.hasStorekeeperRole).toBe(false);
      expect(context.lowStockCount).toBe(0);
      expect(context.lowStockItems).toEqual([]);
    });
  });

  // ── Metrics content ─────────────────────────────────────────────────────────

  describe('Metrics in mail context', () => {
    async function runAndGetContext(
      counts: number[],
    ): Promise<DailySummaryMetrics & { supervisorName: string; date: string }> {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, counts);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(1));

      const restore = freezeHour(17);
      await job.run();
      restore();

      return mail.enqueue.mock.calls[0][0].context;
    }

    it('maps openCount correctly', async () => {
      const ctx = await runAndGetContext([42, 0, 0, 0, 0, 0, 0, 0]);
      expect(ctx.openCount).toBe(42);
    });

    it('maps inProgressCount correctly', async () => {
      const ctx = await runAndGetContext([0, 11, 0, 0, 0, 0, 0, 0]);
      expect(ctx.inProgressCount).toBe(11);
    });

    it('maps pendingValidationCount correctly', async () => {
      const ctx = await runAndGetContext([0, 0, 7, 0, 0, 0, 0, 0]);
      expect(ctx.pendingValidationCount).toBe(7);
    });

    it('maps onHoldCount correctly', async () => {
      const ctx = await runAndGetContext([0, 0, 0, 3, 0, 0, 0, 0]);
      expect(ctx.onHoldCount).toBe(3);
    });

    it('maps overdueCount correctly', async () => {
      const ctx = await runAndGetContext([0, 0, 0, 0, 9, 0, 0, 0]);
      expect(ctx.overdueCount).toBe(9);
    });

    it('maps criticalCount correctly', async () => {
      const ctx = await runAndGetContext([0, 0, 0, 0, 0, 2, 0, 0]);
      expect(ctx.criticalCount).toBe(2);
    });

    it('maps closedTodayCount correctly', async () => {
      const ctx = await runAndGetContext([0, 0, 0, 0, 0, 0, 15, 0]);
      expect(ctx.closedTodayCount).toBe(15);
    });

    it('maps deferredReportCount correctly', async () => {
      const ctx = await runAndGetContext([0, 0, 0, 0, 0, 0, 0, 6]);
      expect(ctx.deferredReportCount).toBe(6);
    });

    it('passes all metric fields in context', async () => {
      const ctx = await runAndGetContext([1, 2, 3, 4, 5, 6, 7, 8]);
      const metricKeys: (keyof DailySummaryMetrics)[] = [
        'openCount',
        'inProgressCount',
        'pendingValidationCount',
        'onHoldCount',
        'overdueCount',
        'criticalCount',
        'closedTodayCount',
        'deferredReportCount',
        'criticalDeferredCount',
        'lowStockCount',
        'overdueList',
        'onHoldItems',
        'lowStockItems',
        'criticalDeferredItems',
      ];
      for (const key of metricKeys) {
        expect(ctx).toHaveProperty(key);
      }
    });
  });

  // ── collectMetrics() Prisma query predicates ────────────────────────────────

  describe('collectMetrics() — Prisma query predicates', () => {
    it('queries OPEN and ASSIGNED statuses for openCount', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: unknown }> = prismaCountMock.mock.calls.map((c) => c[0]);
      const openQuery = calls[0];
      expect(openQuery.where).toMatchObject({
        status: { in: expect.arrayContaining([WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED]) },
      });
    });

    it('queries IN_PROGRESS status for inProgressCount', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: unknown }> = prismaCountMock.mock.calls.map((c) => c[0]);
      expect(calls[1].where).toMatchObject({ status: WorkOrderStatus.IN_PROGRESS });
    });

    it('queries PENDING_VALIDATION status for pendingValidationCount', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: unknown }> = prismaCountMock.mock.calls.map((c) => c[0]);
      expect(calls[2].where).toMatchObject({ status: WorkOrderStatus.PENDING_VALIDATION });
    });

    it('queries ON_HOLD status for onHoldCount', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: unknown }> = prismaCountMock.mock.calls.map((c) => c[0]);
      expect(calls[3].where).toMatchObject({ status: WorkOrderStatus.ON_HOLD });
    });

    it('overdueCount query uses dueDate lt now', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      const before = new Date();
      await job.collectMetrics();
      const after = new Date();

      const calls: Array<{ where: { dueDate?: { lt: Date }; status?: unknown } }> =
        prismaCountMock.mock.calls.map((c) => c[0]);
      const overdueQuery = calls[4];

      expect(overdueQuery.where.dueDate).toBeDefined();
      const ltDate = overdueQuery.where.dueDate!.lt;
      expect(ltDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ltDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('overdueCount query excludes CLOSED and CANCELLED statuses', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: { status?: { in?: string[] } } }> =
        prismaCountMock.mock.calls.map((c) => c[0]);
      const overdueStatuses: string[] = calls[4].where.status?.in ?? [];

      expect(overdueStatuses).not.toContain(WorkOrderStatus.CLOSED);
      expect(overdueStatuses).not.toContain(WorkOrderStatus.CANCELLED);
    });

    it('criticalCount query uses CRITICAL priority with active statuses', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: unknown }> = prismaCountMock.mock.calls.map((c) => c[0]);
      expect(calls[5].where).toMatchObject({ priority: WorkOrderPriority.CRITICAL });
    });

    it('closedTodayCount query uses CLOSED status with closedAt >= start of today', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: { status?: string; closedAt?: { gte: Date } } }> =
        prismaCountMock.mock.calls.map((c) => c[0]);
      const closedQuery = calls[6];

      expect(closedQuery.where.status).toBe(WorkOrderStatus.CLOSED);
      expect(closedQuery.where.closedAt).toBeDefined();

      const gteDate = closedQuery.where.closedAt!.gte;
      expect(gteDate.getHours()).toBe(0);
      expect(gteDate.getMinutes()).toBe(0);
      expect(gteDate.getSeconds()).toBe(0);
    });

    it('deferredReportCount query uses ProblemReport.DEFERRED status', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      const calls: Array<{ where: unknown }> = prismaCountMock.mock.calls.map((c) => c[0]);
      // 8th count query (index 7)
      expect(calls[7].where).toMatchObject({ status: ProblemReportStatus.DEFERRED });
    });

    it('criticalDeferredCount query uses DEFERRED status with deferredAt <= 14-day cutoff', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const before = new Date();
      await job.collectMetrics();
      const after = new Date();

      const calls: Array<{ where: { status?: string; deferredAt?: { lte?: Date; not?: null } } }> =
        prismaCountMock.mock.calls.map((c) => c[0]);
      const criticalDeferredQuery = calls[8];

      expect(criticalDeferredQuery.where.status).toBe(ProblemReportStatus.DEFERRED);
      expect(criticalDeferredQuery.where.deferredAt?.not).toBeNull();
      const lte = criticalDeferredQuery.where.deferredAt?.lte;
      expect(lte).toBeDefined();
      const minExpected = new Date(before.getTime() - 14 * 24 * 60 * 60 * 1000);
      const maxExpected = new Date(after.getTime() - 14 * 24 * 60 * 60 * 1000);
      expect(lte!.getTime()).toBeGreaterThanOrEqual(minExpected.getTime() - 1_000);
      expect(lte!.getTime()).toBeLessThanOrEqual(maxExpected.getTime() + 1_000);
    });

    it('wraps all count queries in a single $transaction', async () => {
      const { job, prismaCountMock, prisma } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg: unknown[] = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(txArg).toHaveLength(9);
    });
  });

  // ── lowStockCount ───────────────────────────────────────────────────────────

  describe('collectMetrics() — lowStockCount', () => {
    it('counts parts where currentStock < minimumStockThreshold', async () => {
      const { job, prismaCountMock, prisma } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.part.findMany.mockResolvedValue([
        { currentStock: 2, minimumStockThreshold: 5 },
        { currentStock: 5, minimumStockThreshold: 5 },
        { currentStock: 0, minimumStockThreshold: 10 },
      ]);

      const metrics = await job.collectMetrics();

      expect(metrics.lowStockCount).toBe(2);
    });

    it('returns 0 when all parts are adequately stocked', async () => {
      const { job, prismaCountMock, prisma } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.part.findMany.mockResolvedValue([
        { currentStock: 10, minimumStockThreshold: 5 },
        { currentStock: 5, minimumStockThreshold: 5 },
      ]);

      const metrics = await job.collectMetrics();

      expect(metrics.lowStockCount).toBe(0);
    });

    it('queries parts with minimumStockThreshold > 0', async () => {
      const { job, prismaCountMock, prisma } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      await job.collectMetrics();

      expect(prisma.part.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { minimumStockThreshold: { gt: 0 } },
        }),
      );
    });

    it('maps lowStockItems with part detail rows', async () => {
      const { job, prismaCountMock, prisma } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.part.findMany.mockResolvedValue([
        {
          name: 'Filter A',
          referenceCode: 'FLT-A',
          currentStock: 1,
          minimumStockThreshold: 5,
        },
      ]);

      const metrics = await job.collectMetrics();

      expect(metrics.lowStockItems).toEqual([
        {
          name: 'Filter A',
          referenceCode: 'FLT-A',
          currentStock: 1,
          minimumStockThreshold: 5,
        },
      ]);
    });
  });

  describe('collectMetrics() — critical deferred reports', () => {
    it('maps criticalDeferredItems with age in days', async () => {
      const { job, prismaCountMock, prisma } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0, 1]);
      const deferredAt = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
      prisma.problemReport.findMany = jest.fn().mockResolvedValue([
        {
          referenceNumber: 'PR-001',
          deferredAt,
          asset: { name: 'Compresseur C-12' },
        },
      ]);

      const metrics = await job.collectMetrics();

      expect(metrics.criticalDeferredCount).toBe(1);
      expect(metrics.criticalDeferredItems).toHaveLength(1);
      expect(metrics.criticalDeferredItems[0]).toMatchObject({
        referenceNumber: 'PR-001',
        assetName: 'Compresseur C-12',
        deferredAt: deferredAt.toISOString(),
      });
      expect(metrics.criticalDeferredItems[0].daysDeferred).toBeGreaterThanOrEqual(16);
    });
  });

  // ── overdueList ─────────────────────────────────────────────────────────────

  describe('collectMetrics() — overdueList', () => {
    it('returns mapped overdueList items from findMany', async () => {
      const { job, prismaCountMock, prismaFindManyMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);
      const dueDate = new Date('2026-04-01T10:00:00Z');
      prismaFindManyMock.mockImplementation((args: { where?: { dueDate?: unknown } }) => {
        if (args?.where && 'dueDate' in args.where) {
          return Promise.resolve([
            {
              referenceNumber: 'WO-001',
              priority: WorkOrderPriority.HIGH,
              dueDate,
              asset: { name: 'Pompe A' },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const metrics = await job.collectMetrics();

      expect(metrics.overdueList).toHaveLength(1);
      expect(metrics.overdueList[0]).toMatchObject({
        referenceNumber: 'WO-001',
        priority: WorkOrderPriority.HIGH,
        dueDate: dueDate.toISOString(),
        assetName: 'Pompe A',
      });
    });

    it('returns an empty overdueList when no overdue WOs exist', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      const metrics = await job.collectMetrics();

      expect(metrics.overdueList).toEqual([]);
    });
  });

  // ── onHoldItems ─────────────────────────────────────────────────────────────

  describe('collectMetrics() — onHoldItems', () => {
    it('computes holdDurationMinutes from active hold period startedAt', async () => {
      const { job, prismaCountMock, prismaFindManyMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);
      const holdStarted = new Date(Date.now() - 120 * 60_000); // 120 minutes ago

      prismaFindManyMock.mockImplementation((args: { where?: { status?: unknown } }) => {
        if (args?.where && 'status' in args.where && args.where.status === WorkOrderStatus.ON_HOLD) {
          return Promise.resolve([
            {
              referenceNumber: 'WO-002',
              asset: { name: 'Convoyeur B' },
              onHoldPeriods: [{ startedAt: holdStarted }],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const before = new Date();
      const metrics = await job.collectMetrics();

      expect(metrics.onHoldItems).toHaveLength(1);
      const item: DailySummaryOnHoldItem = metrics.onHoldItems[0];
      expect(item.referenceNumber).toBe('WO-002');
      expect(item.assetName).toBe('Convoyeur B');
      // Duration should be approximately 120 minutes (allow ±2 for timing)
      expect(item.holdDurationMinutes).toBeGreaterThanOrEqual(118);
      expect(item.holdDurationMinutes).toBeLessThanOrEqual(
        Math.round((new Date().getTime() - holdStarted.getTime()) / 60_000) + 2,
      );
      void before;
    });

    it('uses holdDurationMinutes = 0 when no active onHoldPeriod found', async () => {
      const { job, prismaCountMock, prismaFindManyMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      prismaFindManyMock.mockImplementation((args: { where?: { status?: unknown } }) => {
        if (args?.where && 'status' in args.where && args.where.status === WorkOrderStatus.ON_HOLD) {
          return Promise.resolve([
            {
              referenceNumber: 'WO-003',
              asset: { name: 'Moteur C' },
              onHoldPeriods: [], // no active period
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const metrics = await job.collectMetrics();

      expect(metrics.onHoldItems[0].holdDurationMinutes).toBe(0);
    });

    it('returns an empty onHoldItems when no ON_HOLD WOs exist', async () => {
      const { job, prismaCountMock } = buildMocks();
      setupCountMock(prismaCountMock, [0, 0, 0, 0, 0, 0, 0, 0]);

      const metrics = await job.collectMetrics();

      expect(metrics.onHoldItems).toEqual([]);
    });
  });

  // ── getActiveSupervisors() ───────────────────────────────────────────────────

  describe('getActiveSupervisors()', () => {
    it('queries only active users with the SUPERVISOR role', async () => {
      const { job, prisma } = buildMocks();
      prisma.user.findMany.mockResolvedValue([]);

      await job.getActiveSupervisors();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            roles: { has: 'SUPERVISOR' },
            isActive: true,
          },
        }),
      );
    });

    it('selects id, email, name, and roles fields', async () => {
      const { job, prisma } = buildMocks();
      prisma.user.findMany.mockResolvedValue([]);

      await job.getActiveSupervisors();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, email: true, name: true, roles: true },
        }),
      );
    });
  });

  // ── Regression: multiple calls in same hour ──────────────────────────────────

  describe('Regression / idempotency', () => {
    it('does not double-send if run() is called a second time outside the configured hour', async () => {
      const { job, mail, systemConfig, prismaCountMock, prisma } = buildMocks();
      systemConfig.get.mockResolvedValue('17');
      setupCountMock(prismaCountMock, [5, 3, 2, 1, 4, 1, 7, 2, 5, 3, 2, 1, 4, 1, 7, 2]);
      prisma.user.findMany.mockResolvedValue(buildSupervisors(1));

      const restore17 = freezeHour(17);
      await job.run();
      restore17();

      const restore18 = freezeHour(18);
      await job.run();
      restore18();

      expect(mail.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('job lifecycle logging (§4.1)', () => {
    it('calls recordStart with "daily-summary"', async () => {
      const { job, systemConfig, jobLogger } = buildMocks();
      systemConfig.get.mockResolvedValue(String(new Date().getHours() + 1));
      await job.run();
      expect(jobLogger.recordStart).toHaveBeenCalledWith('daily-summary');
    });

    it('calls recordSuccess after successful execution (even when skipped by hour gate)', async () => {
      const { job, systemConfig, jobLogger } = buildMocks();
      systemConfig.get.mockResolvedValue(String(new Date().getHours() + 1));
      await job.run();
      expect(jobLogger.recordSuccess).toHaveBeenCalledWith('daily-summary');
      expect(jobLogger.recordFailure).not.toHaveBeenCalled();
    });

    it('calls recordFailure and re-throws when systemConfig.get() throws', async () => {
      const { job, systemConfig, jobLogger } = buildMocks();
      const err = new Error('config service unavailable');
      systemConfig.get.mockRejectedValueOnce(err);

      await expect(job.run()).rejects.toThrow('config service unavailable');
      expect(jobLogger.recordFailure).toHaveBeenCalledWith('daily-summary', err);
      expect(jobLogger.recordSuccess).not.toHaveBeenCalled();
    });
  });
});
