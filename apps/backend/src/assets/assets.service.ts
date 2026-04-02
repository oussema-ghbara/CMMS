import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@gmao/db';
import { AssetsRepository } from './assets.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetStatusTransitionDto } from './dto/asset-status-transition.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { AssetStatus } from '@gmao/shared';

// Statuses that WorkOrdersModule sets — Supervisors cannot set these manually
const WO_DRIVEN_STATUSES: AssetStatus[] = [
  AssetStatus.IN_MAINTENANCE,
  AssetStatus.MAINTENANCE_BLOCKED,
];

@Injectable()
export class AssetsService {
  constructor(
    private readonly repo: AssetsRepository,
    private readonly prisma: PrismaService,
  ) {}

  findAll(query: AssetQueryDto) {
    return this.repo.findAll(query);
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  findByQrCode(qrCodeIdentifier: string) {
    return this.repo.findByQrCode(qrCodeIdentifier);
  }

  async create(dto: CreateAssetDto, actorId: string) {
    const asset = await this.repo.create(dto);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'ASSET_CREATED',
        targetType: 'Asset',
        targetId: asset.id,
        valueAfter: asset as unknown as Prisma.JsonObject,
      },
    });
    return asset;
  }

  async update(id: string, dto: UpdateAssetDto, actorId: string) {
    const before = await this.repo.findById(id);
    const after = await this.repo.update(id, dto);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'ASSET_UPDATED',
        targetType: 'Asset',
        targetId: id,
        valueBefore: before as unknown as Prisma.JsonObject,
        valueAfter: after as unknown as Prisma.JsonObject,
      },
    });
    return after;
  }

  async transitionStatus(id: string, dto: AssetStatusTransitionDto, actorId: string) {
    if (WO_DRIVEN_STATUSES.includes(dto.status as AssetStatus)) {
      throw new ForbiddenException(
        `Status ${dto.status} is managed by work orders and cannot be set manually`,
      );
    }

    const asset = await this.repo.findById(id);

    if (asset.status === AssetStatus.DECOMMISSIONED) {
      throw new BadRequestException('A decommissioned asset cannot be transitioned to another status');
    }

    const updated = await this.repo.updateStatus(id, dto.status as AssetStatus, actorId, dto.reason);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'ASSET_STATUS_CHANGED',
        targetType: 'Asset',
        targetId: id,
        valueBefore: { status: asset.status } as Prisma.JsonObject,
        valueAfter: { status: dto.status, reason: dto.reason ?? null } as Prisma.JsonObject,
      },
    });

    return updated;
  }

  getStatusHistory(assetId: string) {
    return this.repo.getStatusHistory(assetId);
  }

  // Exported for WorkOrdersModule use
  logStatusChange(
    assetId: string,
    fromStatus: AssetStatus,
    toStatus: AssetStatus,
    actorId: string,
    workOrderId: string,
    reason?: string,
  ) {
    return this.repo.logStatusChange(assetId, fromStatus, toStatus, actorId, workOrderId, reason);
  }
}
