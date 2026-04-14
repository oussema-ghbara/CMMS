import { WorkOrder } from '@gmao/db';
import { Injectable, BadRequestException } from '@nestjs/common';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { WorkOrderQueryDto } from './dto/work-order-query.dto';
import { CancelWorkOrderDto } from './dto/cancel-work-order.dto';
import { ChangePriorityDto } from './dto/change-priority.dto';
import {
  WorkOrderSource, WorkOrderStatus, AssetStatus, NotificationType, Role,
} from '@gmao/db';
import { assertTransitionAllowed, isTerminal } from './work-orders.state-machine';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly repo: WorkOrdersRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly partRequests: PartRequestsService,
  ) {}

  findAll(query: WorkOrderQueryDto) {
    return this.repo.findAll(query);
  }

  findById(id: string): Promise<WorkOrder> {
    return this.repo.findById(id);
  }
  

  async create(dto: CreateWorkOrderDto, actorId: string): Promise<WorkOrder> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: dto.assetId },
      include: { location: true },
    });
    if (!asset) throw new BadRequestException(`Asset ${dto.assetId} not found`);
    if (asset.status === AssetStatus.DECOMMISSIONED) {
      throw new BadRequestException('Cannot create a work order for a decommissioned asset');
    }

    // Technician validation happens in AssignmentService at the OPEN → ASSIGNED transition.

    const wo = await this.repo.create(
      dto,
      actorId,
      WorkOrderSource.DIRECT_CREATION,
      asset.location.fullPath,
    );

    // Notifications are sent by AssignmentService when the WO transitions OPEN → ASSIGNED.

    return wo;
  }

  async publish(id: string, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(id);
    assertTransitionAllowed(wo.status, WorkOrderStatus.OPEN, [Role.SUPERVISOR]);
    return this.repo.updateStatus(id, WorkOrderStatus.OPEN, actorId, 'Published');
  }

  async cancel(id: string, dto: CancelWorkOrderDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(id);

    assertTransitionAllowed(wo.status, WorkOrderStatus.CANCELLED, [Role.SUPERVISOR]);

    const postAssetStatus = dto.postCancellationAssetStatus ?? AssetStatus.OPERATIONAL;
    const assetWasActive = (
      [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ON_HOLD] as WorkOrderStatus[]
    ).includes(wo.status);

    const updated = await this.repo.updateStatus(
      id,
      WorkOrderStatus.CANCELLED,
      actorId,
      `Cancelled: ${dto.reason}`,
      {
        cancellationReason: dto.reason,
        cancellationDetail: dto.detail,
        cancelledBy: { connect: { id: actorId } },
        cancelledAt: new Date(),
        postCancellationAssetStatus: postAssetStatus,
      },
    );

    if (assetWasActive) {
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: wo.assetId } });
      await this.prisma.$transaction([
        this.prisma.asset.update({
          where: { id: wo.assetId },
          data: { status: postAssetStatus },
        }),
        this.prisma.assetStatusLog.create({
          data: {
            assetId: wo.assetId,
            fromStatus: asset.status,
            toStatus: postAssetStatus,
            actorId,
            workOrderId: id,
            reason: `Work order cancelled: ${dto.reason}`,
          },
        }),
      ]);
    }

    const assignments = await this.prisma.workOrderAssignment.findMany({
      where: { workOrderId: id, isActive: true },
    });

    await this.notifications.notifyMany(
      assignments.map((a) => ({
        recipientId: a.technicianId,
        type: NotificationType.WO_CANCELLED_NOTIFY,
        title: 'Work order cancelled',
        summary: `Work order ${wo.referenceNumber} has been cancelled`,
        entityType: 'WorkOrder',
        entityId: id,
      })),
    );

    // Cancel pending part requests and prompt return of fulfilled parts
    await this.partRequests.handleWorkOrderCancellation(id, actorId);

    return updated;
  }

  async changePriority(id: string, dto: ChangePriorityDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(id);
    if (isTerminal(wo.status)) {
      throw new BadRequestException('Cannot change priority of a closed or cancelled work order');
    }
    return this.repo.updatePriority(id, dto.priority, actorId, false);
  }

  async getStatusHistory(id: string) {
    await this.repo.findById(id);
    return this.prisma.workOrderStatusLog.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, name: true } } },
    });
  }

  async getAnalytics(periodDays: number) {
    const terminalStatuses = [WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED];
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const now = new Date();

    const [
      byStatusRaw,
      byTypeRaw,
      byPriorityRaw,
      total,
      overdue,
      closedThisPeriod,
      cancelledThisPeriod,
      closedWOs,
    ] = await Promise.all([
      this.prisma.workOrder.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.workOrder.groupBy({ by: ['type'], _count: { id: true } }),
      this.prisma.workOrder.groupBy({
        by: ['priority'],
        where: { status: { notIn: terminalStatuses } },
        _count: { id: true },
      }),
      this.prisma.workOrder.count(),
      this.prisma.workOrder.count({
        where: {
          status: { notIn: terminalStatuses },
          AND: [{ dueDate: { not: null } }, { dueDate: { lt: now } }],
        },
      }),
      this.prisma.workOrder.count({
        where: { status: WorkOrderStatus.CLOSED, closedAt: { gte: since } },
      }),
      this.prisma.workOrder.count({
        where: { status: WorkOrderStatus.CANCELLED, cancelledAt: { gte: since } },
      }),
      this.prisma.workOrder.findMany({
        where: { status: WorkOrderStatus.CLOSED, closedAt: { not: null } },
        select: { createdAt: true, closedAt: true },
      }),
    ]);

    const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count.id]));
    const byType = Object.fromEntries(byTypeRaw.map((r) => [r.type, r._count.id]));
    const byPriority = Object.fromEntries(byPriorityRaw.map((r) => [r.priority, r._count.id]));

    const terminalSet = new Set<string>(terminalStatuses);
    const open = byStatusRaw
      .filter((r) => !terminalSet.has(r.status))
      .reduce((sum, r) => sum + r._count.id, 0);

    const totalClosedOrCancelled = closedThisPeriod + cancelledThisPeriod;
    const resolutionRate =
      totalClosedOrCancelled > 0 ? closedThisPeriod / totalClosedOrCancelled : null;

    let avgResolutionDays: number | null = null;
    if (closedWOs.length > 0) {
      const totalMs = closedWOs.reduce(
        (sum, wo) => sum + (wo.closedAt!.getTime() - wo.createdAt.getTime()),
        0,
      );
      avgResolutionDays =
        Math.round((totalMs / closedWOs.length / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    return {
      periodDays,
      summary: { total, open, overdue, closedThisPeriod, cancelledThisPeriod, resolutionRate },
      byStatus,
      byType,
      byPriority,
      avgResolutionDays,
    };
  }

  private async assertActiveTechnician(technicianId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: technicianId } });
    if (!user) throw new BadRequestException(`User ${technicianId} not found`);
    if (!user.isActive) throw new BadRequestException(`Technician ${technicianId} is not active`);
    if (!user.roles.includes(Role.TECHNICIAN)) {
      throw new BadRequestException(`User ${technicianId} does not have the TECHNICIAN role`);
    }
  }
}
