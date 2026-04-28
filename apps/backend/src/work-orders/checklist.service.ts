import {
  Injectable, BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { CompleteChecklistItemDto } from './dto/complete-checklist-item.dto';
import { ChecklistItemStatus, WorkOrderStatus } from '@gmao/db';

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

    return this.prisma.workOrderChecklistItem.update({
      where: { id: itemId },
      data: {
        status: dto.status,
        anomalyDescription: dto.anomalyDescription,
        notApplicableReason: dto.notApplicableReason,
        completedById: actorId,
        completedAt: new Date(),
      },
    });
  }
}
