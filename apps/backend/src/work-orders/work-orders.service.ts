import { WorkOrder } from '@gmao/db';
import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { WorkOrderQueryDto } from './dto/work-order-query.dto';
import { CancelWorkOrderDto } from './dto/cancel-work-order.dto';
import { ChangePriorityDto } from './dto/change-priority.dto';
import {
  WorkOrderSource, WorkOrderStatus, AssetStatus, NotificationType, Role,
  WorkOrderPriority, WorkOrderType,
} from '@gmao/db';
import { StockMovementType } from '@gmao/db';
import { WOCancellationReason } from '@gmao/shared';
import { assertTransitionAllowed, isTerminal } from './work-orders.state-machine';
import { calculateWorkOrderCostSummary } from './work-order-costs';

export interface TechnicianLoadItem {
  technicianId: string;
  name: string;
  openWoCount: number;
  hasCritical: boolean;
}

export interface DurationHintsResult {
  /** Average closure time (days) of the last 5 closed WOs of the same type on this asset */
  last5AssetAvgDays: number | null;
  /** Average closure time (days) of the last 50 closed WOs of the same type in the asset's category */
  categoryAvgDays: number | null;
  /** Average closure time (days) of the selected technician's last 10 closed WOs of the same type (null when no technicianId given) */
  technicianAvgDays: number | null;
}

const ACTIVE_WO_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.DRAFT,
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
];

const CANCELLATION_DETAIL_REQUIRED_REASONS = new Set<WOCancellationReason>([
  WOCancellationReason.EXTERNAL_DECISION,
  WOCancellationReason.RESOLVED_OTHERWISE,
]);

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

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

    if (!dto.forceCreate) {
      const existing = await this.prisma.workOrder.findFirst({
        where: {
          assetId: dto.assetId,
          status: { in: ACTIVE_WO_STATUSES },
        },
        select: { id: true, referenceNumber: true, status: true, type: true },
      });

      if (existing) {
        throw new ConflictException({
          message: 'workOrders.duplicateActiveWo',
          existingWorkOrder: {
            id: existing.id,
            referenceNumber: existing.referenceNumber,
            status: existing.status,
            type: existing.type,
          },
        });
      }
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

    const normalizedDetail = dto.detail?.trim();
    if (
      CANCELLATION_DETAIL_REQUIRED_REASONS.has(dto.reason)
      && !normalizedDetail
    ) {
      throw new BadRequestException({
        message: 'workOrders.cancellationDetailRequired',
        reason: dto.reason,
      });
    }

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
        cancellationDetail: normalizedDetail,
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

  async authorizeSimultaneousMaintenance(id: string, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(id);

    if (isTerminal(wo.status)) {
      throw new BadRequestException(
        'Cannot authorize simultaneous maintenance on a closed or cancelled work order',
      );
    }

    if (wo.simultaneousMaintenanceAuthorized) {
      throw new BadRequestException(
        'Simultaneous maintenance is already authorized for this work order',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.workOrder.update({
        where: { id },
        data: { simultaneousMaintenanceAuthorized: true },
      });
      await tx.workOrderStatusLog.create({
        data: {
          workOrderId: id,
          fromStatus: wo.status,
          toStatus: wo.status,
          actorId,
          label: 'Simultaneous maintenance authorized by supervisor',
        },
      });
      return result;
    });

    this.logger.log(
      `Simultaneous maintenance authorized on WO ${wo.referenceNumber} by actor ${actorId}`,
    );

    if (wo.principalTechnicianId) {
      await this.notifications.notify({
        recipientId: wo.principalTechnicianId,
        type: NotificationType.SIMULTANEOUS_MAINTENANCE_AUTHORIZED,
        title: 'Maintenance simultanée autorisée',
        summary: `Le superviseur a autorisé la maintenance simultanée sur l'ordre de travail ${wo.referenceNumber}. Vous pouvez désormais démarrer l'intervention.`,
        entityType: 'WorkOrder',
        entityId: id,
      });
    }

    return this.repo.findById(updated.id);
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
      costWOs,
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
      this.prisma.workOrder.findMany({
        where: {
          OR: [
            { status: WorkOrderStatus.CLOSED, closedAt: { gte: since } },
            { status: WorkOrderStatus.CANCELLED, cancelledAt: { gte: since } },
          ],
        },
        select: {
          contractorCost: true,
          interventionLogs: {
            select: {
              activeDurationMinutes: true,
              hourlyRateAtTime: true,
            },
          },
          stockMovements: {
            where: { type: StockMovementType.OUTGOING },
            select: {
              type: true,
              quantity: true,
              unitCostAtTime: true,
            },
          },
        },
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

    const costSummary = costWOs.reduce(
      (summary, wo) => {
        const cost = calculateWorkOrderCostSummary(wo as never);
        summary.contractorCost += cost.contractorCost;
        summary.laborCost += cost.laborCost;
        summary.partsCost += cost.partsCost;
        return summary;
      },
      { contractorCost: 0, laborCost: 0, partsCost: 0 },
    );

    costSummary.contractorCost = Math.round((costSummary.contractorCost + Number.EPSILON) * 100) / 100;
    costSummary.laborCost = Math.round((costSummary.laborCost + Number.EPSILON) * 100) / 100;
    costSummary.partsCost = Math.round((costSummary.partsCost + Number.EPSILON) * 100) / 100;

    const totalCost = Math.round(
      (costSummary.contractorCost + costSummary.laborCost + costSummary.partsCost + Number.EPSILON) * 100,
    ) / 100;

    return {
      periodDays,
      summary: { total, open, overdue, closedThisPeriod, cancelledThisPeriod, resolutionRate },
      byStatus,
      byType,
      byPriority,
      avgResolutionDays,
      costSummary: {
        ...costSummary,
        totalCost,
      },
    };
  }

  async autoEscalateOverduePriorities(): Promise<{ checked: number; escalated: number }> {
    const now = new Date();
    const overdue = await this.repo.findOverdueForEscalation(now);

    if (overdue.length === 0) {
      this.logger.debug('Automatic priority escalation: no overdue work orders eligible');
      return { checked: 0, escalated: 0 };
    }

    let escalated = 0;

    for (const wo of overdue) {
      const nextPriority = this.getEscalatedPriority(wo.priority);
      if (!nextPriority) continue;

      await this.repo.updatePriority(wo.id, nextPriority, null, true);
      escalated += 1;

      this.logger.log(
        `Automatic system escalation: WO ${wo.referenceNumber} priority ${wo.priority} -> ${nextPriority}`,
      );

      await this.notifications.notifySupervisors(
        NotificationType.WO_AUTO_ESCALATED,
        'Work order priority auto-escalated',
        `Work order ${wo.referenceNumber} is overdue and was automatically escalated to ${nextPriority}`,
        'WorkOrder',
        wo.id,
      );
    }

    return { checked: overdue.length, escalated };
  }

  private async assertActiveTechnician(technicianId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: technicianId } });
    if (!user) throw new BadRequestException(`User ${technicianId} not found`);
    if (!user.isActive) throw new BadRequestException(`Technician ${technicianId} is not active`);
    if (!user.roles.includes(Role.TECHNICIAN)) {
      throw new BadRequestException(`User ${technicianId} does not have the TECHNICIAN role`);
    }
  }

  /**
   * Creates a follow-up corrective WO linked to a CLOSED WO whose last intervention
   * result was COULD_NOT_INTERVENE (spec §8.8 + §9.5).
   *
   * The new WO is created in DRAFT status, inherits the original WO's asset,
   * and carries `followUpFromId` for the cross-reference chain.
   */
  async createFollowUp(
    originalWoId: string,
    dto: CreateFollowUpDto,
    actorId: string,
  ): Promise<WorkOrder> {
    const originalWo = await this.repo.findById(originalWoId);

    if (originalWo.status !== WorkOrderStatus.CLOSED) {
      throw new BadRequestException(
        'workOrders.followUp.originalMustBeClosed',
      );
    }

    const asset = await this.prisma.asset.findUniqueOrThrow({
      where: { id: originalWo.assetId },
      include: { location: true },
    });

    // Re-use the same asset — the assetId is inherited from the original WO, not
    // taken from the DTO, to ensure the cross-reference chain is unambiguous.
    const followUpDto: CreateWorkOrderDto = {
      type: dto.type,
      priority: dto.priority,
      description: dto.description,
      assetId: originalWo.assetId,
      internalNotes: dto.internalNotes,
      estimatedDurationMinutes: dto.estimatedDurationMinutes,
      dueDate: dto.dueDate,
    } as unknown as CreateWorkOrderDto;

    return this.repo.create(
      followUpDto,
      actorId,
      WorkOrderSource.FOLLOW_UP,
      asset.location.fullPath,
      undefined,
      undefined,
      originalWoId,
    );
  }

  /**
   * Returns per-technician WO load for active (non-terminal) work orders
   * (spec §9.3 — technician load panel).
   *
   * Each entry reports the open WO count and whether any WO is CRITICAL so the
   * supervisor can see at a glance who is overloaded.
   */
  async getTechnicianLoad(): Promise<TechnicianLoadItem[]> {
    const terminalStatuses: WorkOrderStatus[] = [
      WorkOrderStatus.CLOSED,
      WorkOrderStatus.CANCELLED,
    ];

    const assignments = await this.prisma.workOrderAssignment.findMany({
      where: {
        isActive: true,
        workOrder: { status: { notIn: terminalStatuses } },
      },
      select: {
        technicianId: true,
        technician: { select: { id: true, name: true } },
        workOrder: { select: { priority: true } },
      },
    });

    const map = new Map<string, TechnicianLoadItem>();

    for (const a of assignments) {
      const existing = map.get(a.technicianId);
      if (existing) {
        existing.openWoCount += 1;
        if (a.workOrder.priority === WorkOrderPriority.CRITICAL) {
          existing.hasCritical = true;
        }
      } else {
        map.set(a.technicianId, {
          technicianId: a.technicianId,
          name: a.technician.name,
          openWoCount: 1,
          hasCritical: a.workOrder.priority === WorkOrderPriority.CRITICAL,
        });
      }
    }

    return [...map.values()].sort((a, b) => b.openWoCount - a.openWoCount);
  }

  async getDurationHints(
    assetId: string,
    type: WorkOrderType,
    technicianId?: string,
  ): Promise<DurationHintsResult> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { categoryId: true },
    });

    const [last5AssetWOs, categoryWOs, techWOs] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { assetId, type, status: WorkOrderStatus.CLOSED, closedAt: { not: null } },
        orderBy: { closedAt: 'desc' },
        take: 5,
        select: { createdAt: true, closedAt: true },
      }),
      asset?.categoryId
        ? this.prisma.workOrder.findMany({
            where: {
              type,
              status: WorkOrderStatus.CLOSED,
              closedAt: { not: null },
              asset: { categoryId: asset.categoryId },
            },
            orderBy: { closedAt: 'desc' },
            take: 50,
            select: { createdAt: true, closedAt: true },
          })
        : Promise.resolve([]),
      technicianId
        ? this.prisma.workOrder.findMany({
            where: {
              type,
              status: WorkOrderStatus.CLOSED,
              closedAt: { not: null },
              principalTechnicianId: technicianId,
            },
            orderBy: { closedAt: 'desc' },
            take: 10,
            select: { createdAt: true, closedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const avgDays = (wos: { createdAt: Date; closedAt: Date | null }[]): number | null => {
      if (wos.length === 0) return null;
      const total = wos.reduce((sum, wo) => sum + (wo.closedAt!.getTime() - wo.createdAt.getTime()), 0);
      return Math.round((total / wos.length / (1000 * 60 * 60 * 24)) * 10) / 10;
    };

    return {
      last5AssetAvgDays: avgDays(last5AssetWOs),
      categoryAvgDays: avgDays(categoryWOs),
      technicianAvgDays: avgDays(techWOs),
    };
  }

  private getEscalatedPriority(priority: WorkOrder['priority']): WorkOrder['priority'] | null {
    switch (priority) {
      case 'LOW':
        return 'MEDIUM';
      case 'MEDIUM':
        return 'HIGH';
      case 'HIGH':
        return 'CRITICAL';
      case 'CRITICAL':
      default:
        return null;
    }
  }
}
