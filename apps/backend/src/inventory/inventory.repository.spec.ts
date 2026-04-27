import { ConflictException } from '@nestjs/common';
import { Prisma } from '@gmao/db';
import { PartUnit } from '@gmao/shared';
import { InventoryRepository } from './inventory.repository';

const makeDate = (iso: string) => new Date(iso);

describe('InventoryRepository', () => {
  const createRepository = () => {
    const prisma = {
      part: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    return {
      prisma,
      repository: new InventoryRepository(prisma as never),
    };
  };

  const createPartDto = {
    name: 'Hydraulic pump seal',
    referenceCode: 'SEAL-001',
    description: 'Seal for main hydraulic pump',
    unit: PartUnit.PIECE as PartUnit,
    minimumStockThreshold: 2,
    warehouseLocation: 'Aisle 3 / Bin B2',
    unitCost: 15.5,
  };

  const createPrismaUniqueError = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`referenceCode`)', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['referenceCode'] },
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a part when the reference code is available', async () => {
    const { prisma, repository } = createRepository();
    prisma.part.findUnique.mockResolvedValue(null);
    prisma.part.create.mockResolvedValue({ id: 'part-1', ...createPartDto });

    const result = await repository.createPart(createPartDto);

    expect(prisma.part.findUnique).toHaveBeenCalledWith({
      where: { referenceCode: createPartDto.referenceCode },
    });
    expect(prisma.part.create).toHaveBeenCalledWith({
      data: {
        name: createPartDto.name,
        referenceCode: createPartDto.referenceCode,
        description: createPartDto.description,
        unit: createPartDto.unit,
        minimumStockThreshold: createPartDto.minimumStockThreshold,
        warehouseLocation: createPartDto.warehouseLocation,
        unitCost: createPartDto.unitCost,
      },
    });
    expect(result).toEqual({ id: 'part-1', ...createPartDto });
  });

  it('rejects duplicate reference codes before creating a new part', async () => {
    const { prisma, repository } = createRepository();
    prisma.part.findUnique.mockResolvedValue({ id: 'existing-part', isActive: true });

    await expect(repository.createPart(createPartDto)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.part.create).not.toHaveBeenCalled();
  });

  it('maps a Prisma unique-constraint error to a conflict response', async () => {
    const { prisma, repository } = createRepository();
    prisma.part.findUnique.mockResolvedValue(null);
    prisma.part.create.mockRejectedValue(createPrismaUniqueError());

    await expect(repository.createPart(createPartDto)).rejects.toMatchObject({
      status: 409,
      response: {
        message: `A part with reference code "${createPartDto.referenceCode}" already exists`,
        error: 'Conflict',
        statusCode: 409,
      },
    });
  });
});

// ── getCostTrend ───────────────────────────────────────────────────────────────

describe('InventoryRepository.getCostTrend', () => {
  const createRepository = () => {
    const prisma = { $queryRaw: jest.fn() };
    return { prisma, repository: new InventoryRepository(prisma as never) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns mapped monthly cost rows', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      { month: makeDate('2026-02-01T00:00:00.000Z'), total_cost: '1500.00' },
      { month: makeDate('2026-03-01T00:00:00.000Z'), total_cost: '2250.50' },
    ]);

    const result = await repository.getCostTrend(60);

    expect(result).toEqual([
      { month: '2026-02', totalCost: 1500 },
      { month: '2026-03', totalCost: 2250.5 },
    ]);
  });

  it('returns an empty array when no OUTGOING movements exist in the period', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await repository.getCostTrend(30);

    expect(result).toEqual([]);
  });

  it('defaults missing total_cost to 0', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      { month: makeDate('2026-01-01T00:00:00.000Z'), total_cost: null },
    ]);

    const result = await repository.getCostTrend(30);

    expect(result[0].totalCost).toBe(0);
  });

  it('passes a date >= boundary derived from periodDays to the query', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const before = Date.now();
    await repository.getCostTrend(30);
    const after = Date.now();

    const [, sinceArg] = prisma.$queryRaw.mock.calls[0];
    expect(sinceArg.getTime()).toBeGreaterThanOrEqual(before - 30 * 24 * 60 * 60 * 1000);
    expect(sinceArg.getTime()).toBeLessThanOrEqual(after - 30 * 24 * 60 * 60 * 1000 + 100);
  });
});

// ── getLongWaitingOnHoldRequests ───────────────────────────────────────────────

describe('InventoryRepository.getLongWaitingOnHoldRequests', () => {
  const createRepository = () => {
    const prisma = { $queryRaw: jest.fn() };
    return { prisma, repository: new InventoryRepository(prisma as never) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('maps raw query rows to LongWaitingPartRequest objects', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'req-1',
        work_order_id: 'wo-1',
        wo_reference: 'WO-2026-001',
        part_id: 'part-1',
        part_name: 'Hydraulic seal',
        part_reference: 'SEAL-001',
        off_catalog_description: null,
        quantity_requested: 2,
        created_at: makeDate('2026-04-20T10:00:00.000Z'),
        waiting_hours: '36.5',
      },
    ]);

    const result = await repository.getLongWaitingOnHoldRequests(24);

    expect(result).toEqual([
      {
        id: 'req-1',
        workOrderId: 'wo-1',
        woReference: 'WO-2026-001',
        partId: 'part-1',
        partName: 'Hydraulic seal',
        partReference: 'SEAL-001',
        offCatalogDescription: null,
        quantityRequested: 2,
        createdAt: makeDate('2026-04-20T10:00:00.000Z').toISOString(),
        waitingHours: 37,
      },
    ]);
  });

  it('handles off-catalog requests (no partId/partName)', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'req-2',
        work_order_id: 'wo-2',
        wo_reference: 'WO-2026-002',
        part_id: null,
        part_name: null,
        part_reference: null,
        off_catalog_description: 'Special gasket 80mm',
        quantity_requested: 1,
        created_at: makeDate('2026-04-21T08:00:00.000Z'),
        waiting_hours: '26',
      },
    ]);

    const [result] = await repository.getLongWaitingOnHoldRequests(24);

    expect(result.partId).toBeNull();
    expect(result.partName).toBeNull();
    expect(result.offCatalogDescription).toBe('Special gasket 80mm');
  });

  it('returns empty array when no requests exceed the threshold', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await repository.getLongWaitingOnHoldRequests(24);

    expect(result).toEqual([]);
  });

  it('passes a cutoff date derived from thresholdHours to the query', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const before = Date.now();
    await repository.getLongWaitingOnHoldRequests(48);
    const after = Date.now();

    const [, cutoffArg] = prisma.$queryRaw.mock.calls[0];
    expect(cutoffArg.getTime()).toBeGreaterThanOrEqual(before - 48 * 60 * 60 * 1000);
    expect(cutoffArg.getTime()).toBeLessThanOrEqual(after - 48 * 60 * 60 * 1000 + 100);
  });

  it('rounds waiting_hours to nearest integer', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'req-3',
        work_order_id: 'wo-3',
        wo_reference: 'WO-2026-003',
        part_id: 'p1',
        part_name: 'Filter',
        part_reference: 'FLT-001',
        off_catalog_description: null,
        quantity_requested: 3,
        created_at: makeDate('2026-04-22T00:00:00.000Z'),
        waiting_hours: '25.7',
      },
    ]);

    const [result] = await repository.getLongWaitingOnHoldRequests(24);

    expect(result.waitingHours).toBe(26);
  });
});

// ── getConsumptionBreakdown ────────────────────────────────────────────────────

describe('InventoryRepository.getConsumptionBreakdown', () => {
  const createRepository = () => {
    const prisma = { $queryRaw: jest.fn() };
    return { prisma, repository: new InventoryRepository(prisma as never) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns an empty array when no OUTGOING movements exist in the period', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await repository.getConsumptionBreakdown(30);

    expect(result).toEqual([]);
  });

  it('maps a single raw row to the correct nested structure', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Hydraulic seal',
        part_reference: 'SEAL-001',
        category_id: 'cat-1',
        category_name: 'Pompes',
        wo_type: 'CORRECTIVE',
        total_quantity: BigInt(10),
        total_cost: '150.00',
      },
    ]);

    const result = await repository.getConsumptionBreakdown(30);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      partId: 'part-1',
      partName: 'Hydraulic seal',
      partReference: 'SEAL-001',
      totalQuantity: 10,
      totalCost: 150,
    });
    expect(result[0].byAssetCategory).toHaveLength(1);
    expect(result[0].byAssetCategory[0]).toMatchObject({
      categoryId: 'cat-1',
      categoryName: 'Pompes',
      quantity: 10,
      cost: 150,
    });
    expect(result[0].byAssetCategory[0].byWoType).toEqual([
      { woType: 'CORRECTIVE', quantity: 10, cost: 150 },
    ]);
  });

  it('aggregates CORRECTIVE and PREVENTIVE rows for the same part+category pair', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Filter',
        part_reference: 'FLT-001',
        category_id: 'cat-1',
        category_name: 'Compresseurs',
        wo_type: 'CORRECTIVE',
        total_quantity: BigInt(6),
        total_cost: '60.00',
      },
      {
        part_id: 'part-1',
        part_name: 'Filter',
        part_reference: 'FLT-001',
        category_id: 'cat-1',
        category_name: 'Compresseurs',
        wo_type: 'PREVENTIVE',
        total_quantity: BigInt(4),
        total_cost: '40.00',
      },
    ]);

    const result = await repository.getConsumptionBreakdown(30);

    expect(result).toHaveLength(1);
    expect(result[0].totalQuantity).toBe(10);
    expect(result[0].totalCost).toBeCloseTo(100);
    expect(result[0].byAssetCategory).toHaveLength(1);
    expect(result[0].byAssetCategory[0].quantity).toBe(10);
    expect(result[0].byAssetCategory[0].byWoType).toHaveLength(2);
    expect(result[0].byAssetCategory[0].byWoType).toEqual(
      expect.arrayContaining([
        { woType: 'CORRECTIVE', quantity: 6, cost: 60 },
        { woType: 'PREVENTIVE', quantity: 4, cost: 40 },
      ]),
    );
  });

  it('groups rows across two distinct asset categories for the same part', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Bearing',
        part_reference: 'BRG-001',
        category_id: 'cat-1',
        category_name: 'Moteurs',
        wo_type: 'CORRECTIVE',
        total_quantity: BigInt(5),
        total_cost: '50.00',
      },
      {
        part_id: 'part-1',
        part_name: 'Bearing',
        part_reference: 'BRG-001',
        category_id: 'cat-2',
        category_name: 'Pompes',
        wo_type: 'CORRECTIVE',
        total_quantity: BigInt(3),
        total_cost: '30.00',
      },
    ]);

    const result = await repository.getConsumptionBreakdown(30);

    expect(result[0].byAssetCategory).toHaveLength(2);
    expect(result[0].totalQuantity).toBe(8);
    const categoryNames = result[0].byAssetCategory.map((c) => c.categoryName);
    expect(categoryNames).toContain('Moteurs');
    expect(categoryNames).toContain('Pompes');
  });

  it('handles movements with no linked WO (null category and wo_type)', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Gasket',
        part_reference: 'GSK-001',
        category_id: null,
        category_name: null,
        wo_type: null,
        total_quantity: BigInt(7),
        total_cost: '35.00',
      },
    ]);

    const result = await repository.getConsumptionBreakdown(30);

    expect(result[0].byAssetCategory[0].categoryId).toBeNull();
    expect(result[0].byAssetCategory[0].categoryName).toBeNull();
    expect(result[0].byAssetCategory[0].byWoType[0].woType).toBeNull();
  });

  it('sorts returned parts by totalQuantity descending', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-A',
        part_name: 'Part A',
        part_reference: 'A-001',
        category_id: 'cat-1',
        category_name: 'Cat1',
        wo_type: 'CORRECTIVE',
        total_quantity: BigInt(3),
        total_cost: '30.00',
      },
      {
        part_id: 'part-B',
        part_name: 'Part B',
        part_reference: 'B-001',
        category_id: 'cat-1',
        category_name: 'Cat1',
        wo_type: 'CORRECTIVE',
        total_quantity: BigInt(15),
        total_cost: '150.00',
      },
    ]);

    const result = await repository.getConsumptionBreakdown(30);

    expect(result[0].partId).toBe('part-B');
    expect(result[1].partId).toBe('part-A');
  });

  it('passes a since date derived from periodDays to the raw query', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const before = Date.now();
    await repository.getConsumptionBreakdown(30);
    const after = Date.now();

    const [, sinceArg] = prisma.$queryRaw.mock.calls[0];
    expect(sinceArg.getTime()).toBeGreaterThanOrEqual(before - 30 * 24 * 60 * 60 * 1000);
    expect(sinceArg.getTime()).toBeLessThanOrEqual(after - 30 * 24 * 60 * 60 * 1000 + 100);
  });
});

// ── getStockAccuracyRate ───────────────────────────────────────────────────────

describe('InventoryRepository.getStockAccuracyRate', () => {
  const createRepository = () => {
    const prisma = { $queryRaw: jest.fn() };
    return { prisma, repository: new InventoryRepository(prisma as never) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns 100% global rate and empty perPart when no movements exist', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await repository.getStockAccuracyRate(30);

    expect(result.globalRate).toBe(100);
    expect(result.totalMovements).toBe(0);
    expect(result.adjustmentCount).toBe(0);
    expect(result.perPart).toEqual([]);
  });

  it('computes per-part accuracy rate correctly', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Hydraulic seal',
        part_reference: 'SEAL-001',
        total_count: BigInt(10),
        adjustment_count: BigInt(2),
      },
    ]);

    const result = await repository.getStockAccuracyRate(30);

    expect(result.perPart).toHaveLength(1);
    expect(result.perPart[0]).toMatchObject({
      partId: 'part-1',
      partName: 'Hydraulic seal',
      partReference: 'SEAL-001',
      totalMovements: 10,
      adjustmentMovements: 2,
      accuracyRate: 80,
    });
  });

  it('computes global rate from all parts', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Part A',
        part_reference: 'A-001',
        total_count: BigInt(10),
        adjustment_count: BigInt(2),
      },
      {
        part_id: 'part-2',
        part_name: 'Part B',
        part_reference: 'B-001',
        total_count: BigInt(10),
        adjustment_count: BigInt(0),
      },
    ]);

    const result = await repository.getStockAccuracyRate(30);

    // 2 adjustments out of 20 total → 90% accuracy
    expect(result.totalMovements).toBe(20);
    expect(result.adjustmentCount).toBe(2);
    expect(result.globalRate).toBe(90);
  });

  it('returns 0% accuracy rate when all movements are adjustments', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Part A',
        part_reference: 'A-001',
        total_count: BigInt(5),
        adjustment_count: BigInt(5),
      },
    ]);

    const result = await repository.getStockAccuracyRate(30);

    expect(result.perPart[0].accuracyRate).toBe(0);
    expect(result.globalRate).toBe(0);
  });

  it('returns 100% accuracy rate when no adjustments exist', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Filter',
        part_reference: 'FLT-001',
        total_count: BigInt(8),
        adjustment_count: BigInt(0),
      },
    ]);

    const result = await repository.getStockAccuracyRate(30);

    expect(result.perPart[0].accuracyRate).toBe(100);
    expect(result.globalRate).toBe(100);
  });

  it('passes a since date derived from periodDays to the raw query', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([]);

    const before = Date.now();
    await repository.getStockAccuracyRate(30);
    const after = Date.now();

    const [, sinceArg] = prisma.$queryRaw.mock.calls[0];
    expect(sinceArg.getTime()).toBeGreaterThanOrEqual(before - 30 * 24 * 60 * 60 * 1000);
    expect(sinceArg.getTime()).toBeLessThanOrEqual(after - 30 * 24 * 60 * 60 * 1000 + 100);
  });

  it('rounds accuracy rate to one decimal place', async () => {
    const { prisma, repository } = createRepository();
    prisma.$queryRaw.mockResolvedValue([
      {
        part_id: 'part-1',
        part_name: 'Gasket',
        part_reference: 'GSK-001',
        total_count: BigInt(3),
        adjustment_count: BigInt(1),
      },
    ]);

    const result = await repository.getStockAccuracyRate(30);

    // 1 - (1/3) = 0.6666... → 66.7%
    expect(result.perPart[0].accuracyRate).toBe(66.7);
  });
});