import { WorkOrder } from '@gmao/db';
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { PutOnHoldDto } from './dto/put-on-hold.dto';
import { ResolveHoldDto } from './dto/resolve-hold.dto';
import { UpdateHoldMetadataDto } from './dto/update-hold-metadata.dto';
import {
  WorkOrderStatus, OnHoldReasonType, AssetStatus, WorkOrderType, NotificationType, Role,
} from '@gmao/db';
import { assertTransitionAllowed } from './work-orders.state-machine';

function deriveAssetStatus(
  reasonType: OnHoldReasonType,
  woType: WorkOrderType,
  supervisorChoice?: AssetStatus,
): AssetStatus {
  switch (reasonType) {
    case OnHoldReasonType.MISSING_PART:
    case OnHoldReasonType.EXTERNAL_CONTRACTOR:
      return AssetStatus.MAINTENANCE_BLOCKED;
    case OnHoldReasonType.ACCESS_DENIED:
      return woType === WorkOrderType.CORRECTIVE
        ? AssetStatus.MAINTENANCE_BLOCKED
        : AssetStatus.OPERATIONAL;
    case OnHoldReasonType.OTHER:
      if (!supervisorChoice) {
        throw new BadRequestException(
          'supervisorAssetStatusChoice is required when reasonType is OTHER',
        );
      }
      return supervisorChoice;
  }
}

@Injectable()
export class OnHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async putOnHold(woId: string, dto: PutOnHoldDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);

    if (wo.principalTechnicianId !== actorId) {
      throw new ForbiddenException('Only the principal technician can put a work order on hold');
    }
    assertTransitionAllowed(wo.status, WorkOrderStatus.ON_HOLD, [Role.TECHNICIAN]);

    const targetAssetStatus = deriveAssetStatus(
      dto.reasonType, wo.type, dto.supervisorAssetStatusChoice,
    );
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: wo.assetId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id: woId }, data: { status: WorkOrderStatus.ON_HOLD } });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: woId, fromStatus: wo.status, toStatus: WorkOrderStatus.ON_HOLD, actorId },
      });
      await tx.onHoldPeriod.create({
        data: {
          workOrderId: woId,
          reasonType: dto.reasonType,
          detail: dto.detail,
          expectedResolutionDate: dto.expectedResolutionDate
            ? new Date(dto.expectedResolutionDate)
            : undefined,
          supervisorAssetStatusChoice: dto.supervisorAssetStatusChoice,
        },
      });
      await tx.asset.update({ where: { id: wo.assetId }, data: { status: targetAssetStatus } });
      await tx.assetStatusLog.create({
        data: {
          assetId: wo.assetId, fromStatus: asset.status, toStatus: targetAssetStatus,
          actorId, workOrderId: woId, reason: `Work order on hold: ${dto.reasonType}`,
        },
      });
      // Lock completed checklist items so they cannot be undone after resume
      await tx.workOrderChecklistItem.updateMany({
        where: { workOrderId: woId, status: { not: 'PENDING' } },
        data: { isLockedByHold: true },
      });
      // End current intervention log period
      await tx.interventionLog.updateMany({
        where: { workOrderId: woId, technicianId: actorId, endedAt: null },
        data: { endedAt: new Date() },
      });
    });

    await this.notifications.notifySupervisors(
      NotificationType.WO_ON_HOLD,
      'Work order on hold',
      `${wo.referenceNumber} has been put on hold: ${dto.reasonType}`,
      'WorkOrder', woId,
    );

    return this.repo.findById(woId);
  }

  /**
   * Supervisor-only: update hold metadata fields (expectedResolutionDate, retryDate,
   * or resolution plan note) on an active ON_HOLD work order without changing its state.
   * Fixes §6.1: the supervisor note is now set exclusively by the supervisor, not the
   * technician on resume.
   */
  async updateHoldMetadata(woId: string, dto: UpdateHoldMetadataDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);

    if (wo.status !== WorkOrderStatus.ON_HOLD) {
      throw new BadRequestException('workOrders.hold.notOnHold');
    }

    const activeHold = await this.prisma.onHoldPeriod.findFirst({
      where: { workOrderId: woId, resumedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    if (!activeHold) {
      throw new NotFoundException('workOrders.hold.noActiveHoldPeriod');
    }

    const data: Parameters<typeof this.prisma.onHoldPeriod.update>[0]['data'] = {};

    if (dto.expectedResolutionDate !== undefined) {
      data.expectedResolutionDate = new Date(dto.expectedResolutionDate);
    }
    if (dto.retryDate !== undefined) {
      data.retryDate = new Date(dto.retryDate);
    }
    if (dto.resolutionNote !== undefined) {
      data.supervisorResolutionNote = dto.resolutionNote;
    }

    if (Object.keys(data).length === 0) {
      return wo;
    }

    await this.prisma.onHoldPeriod.update({
      where: { id: activeHold.id },
      data,
    });

    return this.repo.findById(woId);
  }

  async resume(woId: string, dto: ResolveHoldDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);

    if (wo.principalTechnicianId !== actorId) {
      throw new ForbiddenException('Only the principal technician can resume a work order');
    }
    assertTransitionAllowed(wo.status, WorkOrderStatus.IN_PROGRESS, [Role.TECHNICIAN]);

    const [asset, technician] = await Promise.all([
      this.prisma.asset.findUniqueOrThrow({ where: { id: wo.assetId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { hourlyRate: true } }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      // supervisorResolutionNote is intentionally NOT written here — it is the
      // supervisor's responsibility, set via PATCH /hold-metadata before resume.
      await tx.onHoldPeriod.updateMany({
        where: { workOrderId: woId, resumedAt: null },
        data: { resumedAt: new Date() },
      });
      await tx.workOrder.update({
        where: { id: woId },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          ...(dto.contractorCost !== undefined && {
            contractorCost: dto.contractorCost,
            contractorCostCaptured: true,
          }),
        },
      });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: woId, fromStatus: wo.status, toStatus: WorkOrderStatus.IN_PROGRESS, actorId },
      });
      await tx.interventionLog.create({
        data: { workOrderId: woId, technicianId: actorId, hourlyRateAtTime: technician.hourlyRate },
      });
      await tx.asset.update({ where: { id: wo.assetId }, data: { status: AssetStatus.IN_MAINTENANCE } });
      await tx.assetStatusLog.create({
        data: {
          assetId: wo.assetId, fromStatus: asset.status,
          toStatus: AssetStatus.IN_MAINTENANCE, actorId, workOrderId: woId,
          reason: 'Work order resumed',
        },
      });
    });

    // Notify active contributor technicians that the WO is back in progress.
    // The principal is the actor who triggered the resume and does not need a self-notification.
    type Assignment = { technicianId: string; isPrincipal: boolean; isActive: boolean };
    const contributors = ((wo as unknown as { assignments: Assignment[] }).assignments ?? [])
      .filter((a) => !a.isPrincipal && a.isActive);

    if (contributors.length > 0) {
      await this.notifications.notifyMany(
        contributors.map((a) => ({
          recipientId: a.technicianId,
          type: NotificationType.WO_RESUMED,
          title: 'Ordre de travail repris',
          summary: `L'ordre de travail ${wo.referenceNumber} est de nouveau en cours d'intervention.`,
          entityType: 'WorkOrder',
          entityId: woId,
        })),
      );
    }

    return this.repo.findById(woId);
  }
}
