import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Asset, AssetStatus, Prisma } from '@gmao/db';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AssetQueryDto): Promise<{ data: Asset[]; total: number }> {
    const { search, status, criticality, categoryId, locationId, page = 1, limit = 20 } = query;

    const where: Prisma.AssetWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { serialNumber: { contains: search, mode: 'insensitive' } },
          { qrCodeIdentifier: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(status && { status }),
      ...(criticality && { criticality }),
      ...(categoryId && { categoryId }),
      ...(locationId && { locationId }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        include: { category: true, location: true, parent: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        category: { include: { checklistTemplateItems: { orderBy: { sortOrder: 'asc' } } } },
        location: true,
        parent: true,
        children: true,
        certificates: { orderBy: { expirationDate: 'asc' } },
        statusLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    return asset;
  }

  async findByQrCode(qrCodeIdentifier: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({
      where: { qrCodeIdentifier },
      include: { category: true, location: true },
    });
    if (!asset) throw new NotFoundException(`Asset with QR code "${qrCodeIdentifier}" not found`);
    return asset;
  }

  async create(dto: CreateAssetDto): Promise<Asset> {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) throw new NotFoundException(`Location ${dto.locationId} not found`);

    const category = await this.prisma.assetCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(`Category ${dto.categoryId} not found`);

    if (dto.parentId) {
      const parent = await this.prisma.asset.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Parent asset ${dto.parentId} not found`);
    }

    return this.prisma.asset.create({
      data: {
        name: dto.name,
        description: dto.description,
        serialNumber: dto.serialNumber,
        manufacturer: dto.manufacturer,
        model: dto.model,
        installationDate: dto.installationDate ? new Date(dto.installationDate) : undefined,
        warrantyExpiration: dto.warrantyExpiration ? new Date(dto.warrantyExpiration) : undefined,
        qrCodeIdentifier: randomUUID(),
        categoryId: dto.categoryId,
        locationId: dto.locationId,
        parentId: dto.parentId,
        criticality: dto.criticality,
      },
      include: { category: true, location: true },
    });
  }

  async update(id: string, dto: UpdateAssetDto): Promise<Asset> {
    await this.findById(id);

    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
      if (!location) throw new NotFoundException(`Location ${dto.locationId} not found`);
    }
    if (dto.categoryId) {
      const category = await this.prisma.assetCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException(`Category ${dto.categoryId} not found`);
    }
    if (dto.parentId) {
      if (dto.parentId === id) throw new Error('An asset cannot be its own parent');
      const parent = await this.prisma.asset.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Parent asset ${dto.parentId} not found`);
    }

    return this.prisma.asset.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        serialNumber: dto.serialNumber,
        manufacturer: dto.manufacturer,
        model: dto.model,
        installationDate: dto.installationDate ? new Date(dto.installationDate) : undefined,
        warrantyExpiration: dto.warrantyExpiration ? new Date(dto.warrantyExpiration) : undefined,
        categoryId: dto.categoryId,
        locationId: dto.locationId,
        parentId: dto.parentId,
        criticality: dto.criticality,
      },
      include: { category: true, location: true },
    });
  }

  async updateStatus(
    id: string,
    toStatus: AssetStatus,
    actorId: string,
    reason?: string,
    workOrderId?: string,
  ): Promise<Asset> {
    const asset = await this.findById(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id },
        data: { status: toStatus },
        include: { category: true, location: true },
      });

      await tx.assetStatusLog.create({
        data: {
          assetId: id,
          fromStatus: asset.status,
          toStatus,
          reason,
          actorId,
          workOrderId,
        },
      });

      return updated;
    });
  }

  async getStatusHistory(assetId: string) {
    await this.findById(assetId);
    return this.prisma.assetStatusLog.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true } } },
    });
  }

  // Called by WorkOrdersModule — exposed for cross-module use
  async logStatusChange(
    assetId: string,
    fromStatus: AssetStatus,
    toStatus: AssetStatus,
    actorId: string,
    workOrderId: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.assetStatusLog.create({
      data: { assetId, fromStatus, toStatus, actorId, workOrderId, reason },
    });
  }
}
