import { ConflictException } from '@nestjs/common';
import { Prisma } from '@gmao/db';
import { PartUnit } from '@gmao/shared';
import { InventoryRepository } from './inventory.repository';

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