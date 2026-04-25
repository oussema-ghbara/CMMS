/**
 * Unit tests for WorkOrdersRepository.findAll() — isOverdue filter (spec §9.3).
 *
 * Strategy: inject a PrismaService stub and assert the correct Prisma WHERE
 * clause is built for each combination of isOverdue + other filters.
 */
import { WorkOrderStatus, WorkOrderPriority } from '@gmao/shared';
import { WorkOrdersRepository } from './work-orders.repository';

// ── Prisma stub ──────────────────────────────────────────────────────────────

function makePrismaStub() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  return {
    workOrder: { findMany, count },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    _findMany: findMany,
    _count: count,
  };
}

type WhereArg = { where: Record<string, unknown> };
type FindManyArg = { where: Record<string, unknown>; skip: number; take: number };

function getFirstCallArg<T>(fn: jest.Mock): T {
  return (fn.mock.calls[0] as [T])[0];
}

// ── Constants ────────────────────────────────────────────────────────────────

const NON_TERMINAL = [
  WorkOrderStatus.DRAFT,
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WorkOrdersRepository.findAll — isOverdue filter (§9.3)', () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let repo: WorkOrdersRepository;

  beforeEach(() => {
    prisma = makePrismaStub();
    repo = new WorkOrdersRepository(prisma as never);
  });

  it('does NOT add dueDate/status filter when isOverdue is undefined', async () => {
    await repo.findAll({ page: 1, limit: 20 });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    expect(arg.where).not.toHaveProperty('dueDate');
    expect(arg.where).not.toHaveProperty('status');
  });

  it('does NOT add dueDate/status filter when isOverdue is false', async () => {
    await repo.findAll({ page: 1, limit: 20, isOverdue: false });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    expect(arg.where).not.toHaveProperty('dueDate');
    expect(arg.where).not.toHaveProperty('status');
  });

  it('adds dueDate < now filter when isOverdue is true', async () => {
    const before = new Date();
    await repo.findAll({ page: 1, limit: 20, isOverdue: true });
    const after = new Date();

    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    const dueDate = arg.where.dueDate as { not: null; lt: Date };

    expect(dueDate).toBeDefined();
    expect(dueDate.not).toBeNull();
    expect(dueDate.lt).toBeInstanceOf(Date);
    expect(dueDate.lt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(dueDate.lt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('restricts status to all non-terminal states when isOverdue is true', async () => {
    await repo.findAll({ page: 1, limit: 20, isOverdue: true });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    const statusFilter = arg.where.status as { in: WorkOrderStatus[] };

    expect(statusFilter).toEqual({ in: NON_TERMINAL });
    expect(statusFilter.in).not.toContain(WorkOrderStatus.CLOSED);
    expect(statusFilter.in).not.toContain(WorkOrderStatus.CANCELLED);
  });

  it('isOverdue filter composes correctly with priority filter', async () => {
    await repo.findAll({ page: 1, limit: 20, isOverdue: true, priority: WorkOrderPriority.CRITICAL });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);

    expect(arg.where.priority).toBe(WorkOrderPriority.CRITICAL);
    expect(arg.where.dueDate).toBeDefined();
  });

  it('does not throw when both isOverdue and explicit status are provided', async () => {
    await expect(
      repo.findAll({ page: 1, limit: 20, isOverdue: true, status: WorkOrderStatus.ON_HOLD }),
    ).resolves.toBeDefined();
  });

  it('applies correct pagination when isOverdue is true', async () => {
    await repo.findAll({ page: 3, limit: 10, isOverdue: true });
    const arg = getFirstCallArg<FindManyArg>(prisma._findMany);
    expect(arg.skip).toBe(20); // (3-1) * 10
    expect(arg.take).toBe(10);
  });

  it('count query uses the same WHERE clause as findMany', async () => {
    await repo.findAll({ page: 1, limit: 5, isOverdue: true });
    const findManyArg = getFirstCallArg<WhereArg>(prisma._findMany);
    const countArg = getFirstCallArg<WhereArg>(prisma._count);
    expect(countArg.where).toEqual(findManyArg.where);
  });
});
