import { WorkOrder } from '@gmao/db';
import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignTechnicianDto } from './dto/assign-technician.dto';
import { ReassignTechnicianDto } from './dto/reassign-technician.dto';
import { PromoteTechnicianDto } from './dto/promote-technician.dto';
import { ContributorBlockDto } from './dto/contributor-block.dto';
import { WorkOrderStatus, AssignmentRole, NotificationType, Role } from '@gmao/db';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async assign(woId: string, dto: AssignTechnicianDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);
    if (wo.status !== WorkOrderStatus.OPEN) {
      throw new BadRequestException(`Can only assign an OPEN work order, current: ${wo.status}`);
    }
    await this.assertActiveTechnician(dto.principalTechnicianId);

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id: woId },
        data: { status: WorkOrderStatus.ASSIGNED, principalTechnicianId: dto.principalTechnicianId },
      });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: woId, fromStatus: WorkOrderStatus.OPEN, toStatus: WorkOrderStatus.ASSIGNED, actorId },
      });
      await tx.workOrderAssignment.create({
        data: { workOrderId: woId, technicianId: dto.principalTechnicianId, role: AssignmentRole.PRINCIPAL },
      });
      if (dto.contributorIds?.length) {
        await tx.workOrderAssignment.createMany({
          data: dto.contributorIds.map((technicianId) => ({
            workOrderId: woId, technicianId, role: AssignmentRole.CONTRIBUTOR,
          })),
        });
      }
    });

    await this.notifications.notify({
      recipientId: dto.principalTechnicianId,
      type: NotificationType.WO_ASSIGNED,
      title: 'Work order assigned',
      summary: `You are principal technician on ${wo.referenceNumber}`,
      entityType: 'WorkOrder', entityId: woId,
    });

    if (dto.contributorIds?.length) {
      await this.notifications.notifyMany(
        dto.contributorIds.map((id) => ({
          recipientId: id,
          type: NotificationType.WO_ASSIGNED,
          title: 'Work order assigned',
          summary: `You are contributor on ${wo.referenceNumber}`,
          entityType: 'WorkOrder', entityId: woId,
        })),
      );
    }

    return this.repo.findById(woId);
  }

  async reassign(woId: string, dto: ReassignTechnicianDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);
    const allowed: WorkOrderStatus[] = [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ON_HOLD];
    if (!allowed.includes(wo.status)) {
      throw new BadRequestException(`Cannot reassign in status ${wo.status}`);
    }
    const oldPrincipalId = wo.principalTechnicianId;
    if (!oldPrincipalId) throw new BadRequestException('No principal technician to reassign from');
    await this.assertActiveTechnician(dto.newTechnicianId);

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderAssignment.updateMany({
        where: { workOrderId: woId, technicianId: oldPrincipalId, role: AssignmentRole.PRINCIPAL, isActive: true },
        data: { isActive: false, removedAt: new Date() },
      });
      await tx.workOrderAssignment.create({
        data: { workOrderId: woId, technicianId: dto.newTechnicianId, role: AssignmentRole.PRINCIPAL },
      });
      await tx.workOrder.update({
        where: { id: woId },
        data: { principalTechnicianId: dto.newTechnicianId },
      });
      await tx.workOrderReassignment.create({
        data: {
          workOrderId: woId,
          fromTechnicianId: oldPrincipalId,
          toTechnicianId: dto.newTechnicianId,
          reason: dto.reason,
          reasonDetail: dto.reasonDetail,
          performedById: actorId,
        },
      });
      if (wo.status === WorkOrderStatus.IN_PROGRESS) {
        await tx.interventionLog.updateMany({
          where: { workOrderId: woId, technicianId: oldPrincipalId, endedAt: null },
          data: { endedAt: new Date(), isReassignmentRemnant: true },
        });
      }
    });

    await this.notifications.notify({
      recipientId: oldPrincipalId,
      type: NotificationType.WO_REASSIGNED_FROM,
      title: 'Work order reassigned',
      summary: `You have been removed from ${wo.referenceNumber}`,
      entityType: 'WorkOrder', entityId: woId,
    });
    await this.notifications.notify({
      recipientId: dto.newTechnicianId,
      type: NotificationType.WO_REASSIGNED_TO,
      title: 'Work order assigned',
      summary: `You are now principal technician on ${wo.referenceNumber}`,
      entityType: 'WorkOrder', entityId: woId,
    });

    return this.repo.findById(woId);
  }

  async promote(woId: string, dto: PromoteTechnicianDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);
    const oldPrincipalId = wo.principalTechnicianId;
    if (!oldPrincipalId) throw new BadRequestException('No current principal to replace');

    const contributorAssignment = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId: woId, technicianId: dto.newPrincipalId, role: AssignmentRole.CONTRIBUTOR, isActive: true },
    });
    if (!contributorAssignment) {
      throw new BadRequestException(`Technician ${dto.newPrincipalId} is not an active contributor`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderAssignment.updateMany({
        where: { workOrderId: woId, technicianId: oldPrincipalId, role: AssignmentRole.PRINCIPAL, isActive: true },
        data: { isActive: false, removedAt: new Date() },
      });
      await tx.workOrderAssignment.update({
        where: { id: contributorAssignment.id },
        data: { role: AssignmentRole.PRINCIPAL },
      });
      await tx.workOrder.update({
        where: { id: woId },
        data: { principalTechnicianId: dto.newPrincipalId },
      });
      await tx.workOrderReassignment.create({
        data: {
          workOrderId: woId,
          fromTechnicianId: oldPrincipalId,
          toTechnicianId: dto.newPrincipalId,
          reason: 'TECHNICIAN_ABSENT',
          reasonDetail: 'Promoted from contributor',
          performedById: actorId,
        },
      });
    });

    await this.notifications.notify({
      recipientId: dto.newPrincipalId,
      type: NotificationType.PROMOTED_TO_PRINCIPAL,
      title: 'Promoted to principal technician',
      summary: `You are now principal technician on ${wo.referenceNumber}`,
      entityType: 'WorkOrder', entityId: woId,
    });
    await this.notifications.notify({
      recipientId: oldPrincipalId,
      type: NotificationType.WO_REASSIGNED_FROM,
      title: 'Replaced as principal',
      summary: `You have been replaced as principal on ${wo.referenceNumber}`,
      entityType: 'WorkOrder', entityId: woId,
    });

    return this.repo.findById(woId);
  }

  async raiseContributorBlock(woId: string, dto: ContributorBlockDto, actorId: string) {
    const wo = await this.repo.findById(woId);
    if (wo.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Block flags can only be raised when the work order is IN_PROGRESS');
    }

    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId: woId, technicianId: actorId, role: AssignmentRole.CONTRIBUTOR, isActive: true },
    });
    if (!assignment) throw new ForbiddenException('Only active contributors can raise a block flag');

    const flag = await this.prisma.contributorBlockFlag.create({
      data: { assignmentId: assignment.id, reasonType: dto.reasonType, detail: dto.detail },
    });

    if (wo.principalTechnicianId) {
      await this.notifications.notify({
        recipientId: wo.principalTechnicianId,
        type: NotificationType.CONTRIBUTOR_BLOCK_RECEIVED,
        title: 'Contributor is blocked',
        summary: `A contributor is blocked on ${wo.referenceNumber}: ${dto.reasonType}`,
        entityType: 'WorkOrder', entityId: woId,
      });
    }

    return flag;
  }

  async resolveContributorBlock(blockId: string) {
    const flag = await this.prisma.contributorBlockFlag.findUnique({ where: { id: blockId } });
    if (!flag) throw new NotFoundException(`Block flag ${blockId} not found`);
    return this.prisma.contributorBlockFlag.update({
      where: { id: blockId },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }

  private async assertActiveTechnician(technicianId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: technicianId } });
    if (!user) throw new NotFoundException(`User ${technicianId} not found`);
    if (!user.isActive) throw new BadRequestException(`Technician ${technicianId} is not active`);
    if (!user.roles.includes(Role.TECHNICIAN)) {
      throw new BadRequestException(`User ${technicianId} does not have the TECHNICIAN role`);
    }
  }
}
