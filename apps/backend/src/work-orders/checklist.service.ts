import {
  Injectable, BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { CompleteChecklistItemDto } from './dto/complete-checklist-item.dto';
import {
  ChecklistItemStatus, WorkOrderStatus, WorkOrderType, WorkOrderSource,
} from '@gmao/db';
import { nextWorkOrderReference } from '../common/reference-number.util';

@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
  ) {}

  async getChecklist(woId: string) {
    await this.repo.findById(woId);
    return this.prisma.workOrderChecklistItem.findMany({
      where: { workOrderId: woId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async completeItem(
    woId: string,
    itemId: string,
    dto: CompleteChecklistItemDto,
    actorId: string,
  ) {
    const wo = await this.repo.findById(woId);

    if (wo.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Checklist items can only be completed while the work order is IN_PROGRESS');
    }

    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId: woId, technicianId: actorId, isActive: true },
    });
    if (!assignment) throw new ForbiddenException('You are not assigned to this work order');

    const item = await this.prisma.workOrderChecklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Checklist item ${itemId} not found`);
    if (item.workOrderId !== woId) {
      throw new BadRequestException('Checklist item does not belong to this work order');
    }
    if (item.status !== ChecklistItemStatus.PENDING) {
      throw new BadRequestException('This checklist item has already been completed and is locked');
    }

    if (dto.status === ChecklistItemStatus.ANOMALY_DETECTED && !dto.anomalyDescription) {
      throw new BadRequestException('anomalyDescription is required when status is ANOMALY_DETECTED');
    }
    if (dto.status === ChecklistItemStatus.NOT_APPLICABLE) {
      if (item.isMandatory) {
        throw new BadRequestException('Mandatory checklist items cannot be marked NOT_APPLICABLE');
      }
      if (!dto.notApplicableReason) {
        throw new BadRequestException('notApplicableReason is required when status is NOT_APPLICABLE');
      }
    }

    const updated = await this.prisma.workOrderChecklistItem.update({
      where: { id: itemId },
      data: {
        status: dto.status,
        anomalyDescription: dto.anomalyDescription,
        notApplicableReason: dto.notApplicableReason,
        completedById: actorId,
        completedAt: new Date(),
      },
    });

    // Auto-create corrective WO when anomaly detected and configured
    if (dto.status === ChecklistItemStatus.ANOMALY_DETECTED && item.autoCreateCorrectiveWO) {
      const asset = await this.prisma.asset.findUniqueOrThrow({
        where: { id: wo.assetId },
        include: { location: true },
      });

      await this.prisma.$transaction(async (tx) => {
        const referenceNumber = await nextWorkOrderReference(tx);

        await tx.workOrder.create({
          data: {
            referenceNumber,
            type: WorkOrderType.CORRECTIVE,
            status: WorkOrderStatus.OPEN,
            priority: wo.priority,
            sourceType: WorkOrderSource.CHECKLIST_ANOMALY,
            description: `Auto-created: anomaly on checklist item "${item.description}"`,
            capturedLocationPath: asset.location.fullPath,
            assetId: wo.assetId,
            triggeredByChecklistItemId: itemId,
            sourcePlanId: wo.sourcePlanId ?? undefined,
            createdById: actorId,
          },
        });
      });
    }

    return updated;
  }
}
