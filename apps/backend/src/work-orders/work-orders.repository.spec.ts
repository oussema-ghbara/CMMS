/**
 * Unit tests for WorkOrdersRepository.findAll — closedAfter / closedBefore filters.
 *
 * Business rule (§2.2): the supervisor dashboard "recent closures today" panel uses
 * GET /work-orders?status=CLOSED&closedAfter=<today-start> to count WOs closed since
 * midnight. The repository must translate the ISO-8601 strings into Prisma `closedAt`
 * range predicates without altering any other query behaviour.
 *
 * Failure scenario: if closedAfter/closedBefore are silently ignored, the panel
 * always shows 0 regardless of how many WOs were closed today.
 *
 * Regression safety: when neither param is provided, the `closedAt` filter must not
 * appear in the `where` clause — existing callers must not be affected.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';

const EMPTY_PAGE = { data: [], total: 0 };

function makeWo(id: string) {
  return { id, referenceNumber: `WO-${id}`, status: 'CLOSED' };
}

describe('WorkOrdersRepository.findAll — closedAfter / closedBefore', () => {
  let repo: WorkOrdersRepository;
  let prisma: jest.Mocked<PrismaService>;
  let findManyMock: jest.Mock;
  let countMock: jest.Mock;

  beforeEach(async () => {
    findManyMock = jest.fn().mockResolvedValue([]);
    countMock = jest.fn().mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersRepository,
        {
          provide: PrismaService,
          useValue: {
            workOrder: {
              findMany: findManyMock,
              count: countMock,
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              aggregate: jest.fn(),
            },
            $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
          },
        },
      ],
    }).compile();

    repo = module.get(WorkOrdersRepository);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // ── closedAfter ─────────────────────────────────────────────────────────────

  describe('closedAfter filter', () => {
    const todayIso = '2026-04-22T00:00:00.000Z';

    it('adds gte predicate to closedAt when closedAfter is provided', async () => {
      await repo.findAll({ closedAfter: todayIso });

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            closedAt: expect.objectContaining({ gte: new Date(todayIso) }),
          }),
        }),
      );
    });

    it('passes the correct Date object (not a string)', async () => {
      await repo.findAll({ closedAfter: todayIso });

      const calledWhere = findManyMock.mock.calls[0][0].where;
      expect(calledWhere.closedAt.gte).toBeInstanceOf(Date);
      expect(calledWhere.closedAt.gte.toISOString()).toBe(todayIso);
    });

    it('omits closedAt when closedAfter is absent', async () => {
      await repo.findAll({ status: 'CLOSED' as any });

      const calledWhere = findManyMock.mock.calls[0][0].where;
      expect(calledWhere.closedAt).toBeUndefined();
    });
  });

  // ── closedBefore ────────────────────────────────────────────────────────────

  describe('closedBefore filter', () => {
    const endIso = '2026-04-22T23:59:59.000Z';

    it('adds lte predicate to closedAt when closedBefore is provided', async () => {
      await repo.findAll({ closedBefore: endIso });

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            closedAt: expect.objectContaining({ lte: new Date(endIso) }),
          }),
        }),
      );
    });
  });

  // ── combined range ──────────────────────────────────────────────────────────

  describe('combined closedAfter + closedBefore', () => {
    const start = '2026-04-22T00:00:00.000Z';
    const end   = '2026-04-22T23:59:59.000Z';

    it('produces both gte and lte inside the same closedAt object', async () => {
      await repo.findAll({ closedAfter: start, closedBefore: end });

      const calledWhere = findManyMock.mock.calls[0][0].where;
      expect(calledWhere.closedAt).toEqual({
        gte: new Date(start),
        lte: new Date(end),
      });
    });
  });

  // ── does not break other filters ────────────────────────────────────────────

  describe('regression — other filters unaffected', () => {
    it('still applies status filter when closedAfter is also set', async () => {
      await repo.findAll({ status: 'CLOSED' as any, closedAfter: '2026-04-22T00:00:00.000Z' });

      const calledWhere = findManyMock.mock.calls[0][0].where;
      expect(calledWhere.status).toBe('CLOSED');
    });

    it('search filter still works alongside closedAfter', async () => {
      await repo.findAll({ search: 'pump', closedAfter: '2026-04-22T00:00:00.000Z' });

      const calledWhere = findManyMock.mock.calls[0][0].where;
      expect(calledWhere).toHaveProperty('OR');
      expect(calledWhere.closedAt).toBeDefined();
    });

    it('omits closedAt entirely when neither closedAfter nor closedBefore is given', async () => {
      await repo.findAll({});

      const calledWhere = findManyMock.mock.calls[0][0].where;
      expect(Object.keys(calledWhere)).not.toContain('closedAt');
    });
  });
});
