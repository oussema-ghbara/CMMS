import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PartUnit } from '@gmao/db';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { PartsController } from './parts.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const request = require('supertest');

describe('PartsController (integration)', () => {
  let app: INestApplication;

  const prismaMock = {
    part: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const createPrismaUniqueError = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`referenceCode`)', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['referenceCode'] },
    });

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PartsController],
      providers: [
        InventoryService,
        InventoryRepository,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 409 when the database rejects a duplicate reference code', async () => {
    prismaMock.part.findUnique.mockResolvedValue(null);
    prismaMock.part.create.mockRejectedValue(createPrismaUniqueError());

    const payload = {
      name: 'Hydraulic pump seal',
      referenceCode: 'SEAL-001',
      description: 'Seal for main hydraulic pump',
      unit: PartUnit.PIECE,
      minimumStockThreshold: 2,
      warehouseLocation: 'Aisle 3 / Bin B2',
      unitCost: 15.5,
    };

    const response = await request(app.getHttpServer())
      .post('/parts')
      .send(payload)
      .expect(409);

    expect(response.body).toMatchObject({
      message: `A part with reference code "${payload.referenceCode}" already exists`,
      error: 'Conflict',
      statusCode: 409,
    });
  });
});