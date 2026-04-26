/**
 * Unit tests for WorkOrdersRepository.findAll() — isActive filter (spec §9.3).
 *
 * Strategy: inject a PrismaService stub and assert the correct Prisma WHERE
 * clause is built for each combination of isActive + other filters.
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

const ACTIVE_STATUSES = [
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WorkOrdersRepository.findAll — isActive filter (§9.3)', () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let repo: WorkOrdersRepository;

  beforeEach(() => {
    prisma = makePrismaStub();
    repo = new WorkOrdersRepository(prisma as never);
  });

  it('does NOT add status filter when isActive is undefined', async () => {
    await repo.findAll({ page: 1, limit: 20 });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    expect(arg.where).not.toHaveProperty('status');
  });

  it('does NOT add status filter when isActive is false', async () => {
    await repo.findAll({ page: 1, limit: 20, isActive: false });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    expect(arg.where).not.toHaveProperty('status');
  });

  it('adds status: { in: ACTIVE_STATUSES } when isActive is true', async () => {
    await repo.findAll({ page: 1, limit: 20, isActive: true });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    const statusFilter = arg.where.status as { in: WorkOrderStatus[] };

    expect(statusFilter).toBeDefined();
    expect(statusFilter.in).toEqual(ACTIVE_STATUSES);
  });

  it('ACTIVE_STATUSES contains ASSIGNED, IN_PROGRESS, ON_HOLD only', async () => {
    await repo.findAll({ page: 1, limit: 20, isActive: true });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    const statusFilter = arg.where.status as { in: WorkOrderStatus[] };

    expect(statusFilter.in).toContain(WorkOrderStatus.ASSIGNED);
    expect(statusFilter.in).toContain(WorkOrderStatus.IN_PROGRESS);
    expect(statusFilter.in).toContain(WorkOrderStatus.ON_HOLD);
    expect(statusFilter.in).not.toContain(WorkOrderStatus.DRAFT);
    expect(statusFilter.in).not.toContain(WorkOrderStatus.OPEN);
    expect(statusFilter.in).not.toContain(WorkOrderStatus.PENDING_VALIDATION);
    expect(statusFilter.in).not.toContain(WorkOrderStatus.CLOSED);
    expect(statusFilter.in).not.toContain(WorkOrderStatus.CANCELLED);
  });

  it('isActive filter composes correctly with priority filter', async () => {
    await repo.findAll({ page: 1, limit: 20, isActive: true, priority: WorkOrderPriority.CRITICAL });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);

    expect(arg.where.priority).toBe(WorkOrderPriority.CRITICAL);
    expect(arg.where.status).toBeDefined();
  });

  it('isActive filter composes correctly with assetId filter', async () => {
    await repo.findAll({ page: 1, limit: 20, isActive: true, assetId: 'asset-123' });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);

    expect(arg.where.assetId).toBe('asset-123');
    expect(arg.where.status).toBeDefined();
  });

  it('applies correct pagination when isActive is true', async () => {
    await repo.findAll({ page: 3, limit: 10, isActive: true });
    const arg = getFirstCallArg<FindManyArg>(prisma._findMany);
    expect(arg.skip).toBe(20); // (3-1) * 10
    expect(arg.take).toBe(10);
  });

  it('count query uses the same WHERE clause as findMany', async () => {
    await repo.findAll({ page: 1, limit: 5, isActive: true });
    const findManyArg = getFirstCallArg<WhereArg>(prisma._findMany);
    const countArg = getFirstCallArg<WhereArg>(prisma._count);
    expect(countArg.where).toEqual(findManyArg.where);
  });

  it('does not override an explicit status param when isActive is not set', async () => {
    await repo.findAll({ page: 1, limit: 20, status: WorkOrderStatus.CLOSED });
    const arg = getFirstCallArg<WhereArg>(prisma._findMany);
    expect(arg.where.status).toBe(WorkOrderStatus.CLOSED);
  });
});
