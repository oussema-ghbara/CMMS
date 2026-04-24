/**
 * Unit tests for WorkOrdersRepository escalation queries (§4.3)
 *
 * Covers:
 * - findOverdueForEscalation: only includes OPEN and ASSIGNED WOs (not IN_PROGRESS,
 *   ON_HOLD, PENDING_VALIDATION, CLOSED, CANCELLED)
 * - findOverdueForEscalation: excludes CRITICAL priority WOs
 * - findOverdueCritical: only includes CRITICAL WOs in OPEN or ASSIGNED status
 * - Both methods respect the dueDate < now constraint
 */

import { WorkOrdersRepository } from './work-orders.repository';
import { WorkOrderStatus, WorkOrderPriority } from '@gmao/db';

function buildPrisma(findManyMock: jest.Mock) {
  return {
    workOrder: { findMany: findManyMock },
  };
}

describe('WorkOrdersRepository — escalation queries (§4.3)', () => {
  let findMany: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
  });

  describe('findOverdueForEscalation()', () => {
    it('queries only OPEN and ASSIGNED statuses', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      const now = new Date();
      await repo.findOverdueForEscalation(now);

      expect(findMany).toHaveBeenCalledTimes(1);
      const where = findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({
        in: [WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED],
      });
    });

    it('excludes CRITICAL priority', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      const now = new Date();
      await repo.findOverdueForEscalation(now);

      const where = findMany.mock.calls[0][0].where;
      expect(where.priority).toEqual({ not: WorkOrderPriority.CRITICAL });
    });

    it('filters dueDate < now', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      const now = new Date('2026-01-01T12:00:00Z');
      await repo.findOverdueForEscalation(now);

      const where = findMany.mock.calls[0][0].where;
      expect(where.dueDate).toEqual({ not: null, lt: now });
    });

    it('does NOT include IN_PROGRESS in status filter', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      await repo.findOverdueForEscalation(new Date());

      const where = findMany.mock.calls[0][0].where;
      expect(where.status.in).not.toContain(WorkOrderStatus.IN_PROGRESS);
      expect(where.status.in).not.toContain(WorkOrderStatus.ON_HOLD);
      expect(where.status.in).not.toContain(WorkOrderStatus.PENDING_VALIDATION);
    });
  });

  describe('findOverdueCritical()', () => {
    it('queries only CRITICAL priority', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      const now = new Date();
      await repo.findOverdueCritical(now);

      expect(findMany).toHaveBeenCalledTimes(1);
      const where = findMany.mock.calls[0][0].where;
      expect(where.priority).toBe(WorkOrderPriority.CRITICAL);
    });

    it('queries only OPEN and ASSIGNED statuses', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      await repo.findOverdueCritical(new Date());

      const where = findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({
        in: [WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED],
      });
    });

    it('filters dueDate < now', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      const now = new Date('2026-06-01T08:00:00Z');
      await repo.findOverdueCritical(now);

      const where = findMany.mock.calls[0][0].where;
      expect(where.dueDate).toEqual({ not: null, lt: now });
    });

    it('selects only id and referenceNumber', async () => {
      const repo = new WorkOrdersRepository(buildPrisma(findMany) as never);
      await repo.findOverdueCritical(new Date());

      const select = findMany.mock.calls[0][0].select;
      expect(select).toEqual({ id: true, referenceNumber: true });
    });
  });
});
