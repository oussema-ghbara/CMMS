/**
 * Unit tests for InventoryRepository.getUnitCostTrendPerPart() (spec §10.6).
 *
 * Strategy: stub $queryRaw to return controlled rows and assert the grouping,
 * rounding, and ordering logic implemented in the repository method.
 */
import { InventoryRepository } from './inventory.repository';

function makePrismaStub(rawRows: unknown[]) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(rawRows),
  };
}

const makeDate = (iso: string) => new Date(iso);

describe('InventoryRepository.getUnitCostTrendPerPart (§10.6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an empty array when no INCOMING movements with unitCostAtTime exist', async () => {
    const prisma = makePrismaStub([]);
    const repo = new InventoryRepository(prisma as never);

    const result = await repo.getUnitCostTrendPerPart(30);

    expect(result).toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('groups rows by part and returns one entry per part', async () => {
    const rows = [
      { part_id: 'p1', part_name: 'Bearing A', part_reference: 'BRG-001', month: makeDate('2026-03-01'), avg_unit_cost: '12.50' },
      { part_id: 'p1', part_name: 'Bearing A', part_reference: 'BRG-001', month: makeDate('2026-04-01'), avg_unit_cost: '13.00' },
      { part_id: 'p2', part_name: 'Seal B', part_reference: 'SL-002', month: makeDate('2026-04-01'), avg_unit_cost: '5.75' },
    ];

    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const result = await repo.getUnitCostTrendPerPart(30);

    expect(result).toHaveLength(2);
    expect(result[0].partId).toBe('p1');
    expect(result[1].partId).toBe('p2');
  });

  it('maps trend entries with correct month string format (YYYY-MM)', async () => {
    const rows = [
      { part_id: 'p1', part_name: 'Pump', part_reference: 'PMP-01', month: makeDate('2026-03-01T00:00:00.000Z'), avg_unit_cost: '20.00' },
    ];
    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const [entry] = await repo.getUnitCostTrendPerPart(30);

    expect(entry.trend).toHaveLength(1);
    expect(entry.trend[0].month).toBe('2026-03');
  });

  it('rounds avgUnitCost to 2 decimal places', async () => {
    const rows = [
      { part_id: 'p1', part_name: 'Filter', part_reference: 'FLT-01', month: makeDate('2026-04-01'), avg_unit_cost: '7.6666666' },
    ];
    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const [entry] = await repo.getUnitCostTrendPerPart(30);

    expect(entry.trend[0].avgUnitCost).toBe(7.67);
  });

  it('preserves the month ordering returned by the SQL query (ascending)', async () => {
    const rows = [
      { part_id: 'p1', part_name: 'Belt', part_reference: 'BLT-01', month: makeDate('2026-02-01'), avg_unit_cost: '9.00' },
      { part_id: 'p1', part_name: 'Belt', part_reference: 'BLT-01', month: makeDate('2026-03-01'), avg_unit_cost: '9.50' },
      { part_id: 'p1', part_name: 'Belt', part_reference: 'BLT-01', month: makeDate('2026-04-01'), avg_unit_cost: '10.00' },
    ];
    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const [entry] = await repo.getUnitCostTrendPerPart(90);

    expect(entry.trend.map((m) => m.month)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(entry.trend.map((m) => m.avgUnitCost)).toEqual([9.0, 9.5, 10.0]);
  });

  it('includes partId, partName, partReference on each entry', async () => {
    const rows = [
      { part_id: 'abc-123', part_name: 'Valve', part_reference: 'VLV-99', month: makeDate('2026-04-01'), avg_unit_cost: '33.00' },
    ];
    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const [entry] = await repo.getUnitCostTrendPerPart(30);

    expect(entry.partId).toBe('abc-123');
    expect(entry.partName).toBe('Valve');
    expect(entry.partReference).toBe('VLV-99');
  });

  it('handles a part with a single month of data (no trend comparison, but valid)', async () => {
    const rows = [
      { part_id: 'p1', part_name: 'Gasket', part_reference: 'GSK-01', month: makeDate('2026-04-01'), avg_unit_cost: '2.50' },
    ];
    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const result = await repo.getUnitCostTrendPerPart(30);

    expect(result).toHaveLength(1);
    expect(result[0].trend).toHaveLength(1);
  });

  it('handles numeric string "0.00" from Prisma without throwing', async () => {
    const rows = [
      { part_id: 'p1', part_name: 'Cap', part_reference: 'CAP-01', month: makeDate('2026-04-01'), avg_unit_cost: '0.00' },
    ];
    const repo = new InventoryRepository(makePrismaStub(rows) as never);
    const [entry] = await repo.getUnitCostTrendPerPart(30);

    expect(entry.trend[0].avgUnitCost).toBe(0);
  });
});
