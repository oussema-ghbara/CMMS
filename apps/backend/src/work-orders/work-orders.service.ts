import { WorkOrder } from '@gmao/db';
import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { StorageService } from '../storage/storage.service';
import { ReportGenerationService } from './report-generation.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { WorkOrderQueryDto } from './dto/work-order-query.dto';
import { CancelWorkOrderDto } from './dto/cancel-work-order.dto';
import { ChangePriorityDto } from './dto/change-priority.dto';
import {
  WorkOrderSource, WorkOrderStatus, AssetStatus, NotificationType, Role,
  WorkOrderPriority, WorkOrderType, InterventionResult,
} from '@gmao/db';
import { StockMovementType } from '@gmao/db';
import { WOCancellationReason, ChecklistItemStatus } from '@gmao/shared';
import { assertTransitionAllowed, isTerminal } from './work-orders.state-machine';
import { calculateWorkOrderCostSummary } from './work-order-costs';
import { computeCompliancePerPlan, computeAnomalyPerChecklistItem } from './work-orders.analytics-helpers';

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

export interface WorkOrderDetailValidationInsights {
  contributorsWithoutLog: Array<{ technicianId: string; name: string }>;
  hasNotableTimeDeviation: boolean;
  timeDeviation: {
    estimatedDurationMinutes: number | null;
    actualDurationMinutes: number;
    deltaMinutes: number | null;
    deltaPercent: number | null;
  };
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
    private readonly storage: StorageService,
    private readonly reportGenerator: ReportGenerationService,
  ) {}

  findAll(query: WorkOrderQueryDto) {
    return this.repo.findAll(query);
  }

  async findById(id: string): Promise<WorkOrder & WorkOrderDetailValidationInsights> {
    const wo = await this.repo.findById(id);

    const assignments = (wo as unknown as {
      assignments?: Array<{
        technicianId: string;
        isPrincipal: boolean;
        isActive: boolean;
        technician?: { name: string } | null;
      }>;
    }).assignments ?? [];

    const interventionLogs = (wo as unknown as {
      interventionLogs?: Array<{ technicianId: string; activeDurationMinutes: number | null }>;
    }).interventionLogs ?? [];

    const contributorsWithoutLog = this.computeContributorsWithoutLog(assignments, interventionLogs);
    const timeDeviation = this.computeTimeDeviation(wo, interventionLogs);

    return {
      ...wo,
      contributorsWithoutLog,
      hasNotableTimeDeviation: timeDeviation.deltaMinutes !== null && timeDeviation.deltaMinutes !== 0,
      timeDeviation,
    };
  }

  private computeContributorsWithoutLog(
    assignments: Array<{
      technicianId: string;
      isPrincipal: boolean;
      isActive: boolean;
      technician?: { name: string } | null;
    }>,
    interventionLogs: Array<{ technicianId: string }>,
  ): Array<{ technicianId: string; name: string }> {
    const contributors = assignments.filter((assignment) => assignment.isActive && !assignment.isPrincipal);
    const techniciansWithLogs = new Set(interventionLogs.map((log) => log.technicianId));

    return contributors
      .filter((contributor) => !techniciansWithLogs.has(contributor.technicianId))
      .map((contributor) => ({
        technicianId: contributor.technicianId,
        name: contributor.technician?.name ?? contributor.technicianId,
      }));
  }

  private computeTimeDeviation(
    wo: WorkOrder,
    interventionLogs: Array<{ activeDurationMinutes: number | null }>,
  ): WorkOrderDetailValidationInsights['timeDeviation'] {
    const estimatedDurationMinutes = wo.estimatedDurationMinutes;
    const actualDurationMinutes = interventionLogs.reduce(
      (sum, log) => sum + (log.activeDurationMinutes ?? 0),
      0,
    );

    if (estimatedDurationMinutes == null) {
      return {
        estimatedDurationMinutes: null,
        actualDurationMinutes,
        deltaMinutes: null,
        deltaPercent: null,
      };
    }

    const deltaMinutes = actualDurationMinutes - estimatedDurationMinutes;
    const deltaPercent = estimatedDurationMinutes === 0
      ? null
      : Number(((deltaMinutes / estimatedDurationMinutes) * 100).toFixed(2));

    return {
      estimatedDurationMinutes,
      actualDurationMinutes,
      deltaMinutes,
      deltaPercent,
    };
  }

  async getReportUrl(id: string): Promise<{ url: string }> {
    const wo = await this.repo.findById(id);
    if (wo.status !== WorkOrderStatus.CLOSED) {
      throw new BadRequestException('workOrders.report.notClosed');
    }

    let storageKey = (wo as any).reportPdfKey as string | null;

    if (!storageKey) {
      this.logger.log(`Generating on-demand PDF report for WO ${id}`);
      const pdfBuffer = await this.reportGenerator.generateReport(id);
      const fileName = `work-order-${id}-${Date.now()}.pdf`;
      storageKey = `reports/${fileName}`;
      await this.storage.upload('pdfs', storageKey, pdfBuffer, 'application/pdf');
      await this.prisma.workOrder.update({
        where: { id },
        data: { reportPdfKey: storageKey },
      });
    }

    const url = await this.storage.getPresignedUrl('pdfs', storageKey);
    return { url };
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

    // §9.4, §12.4: Notify the original requester when the WO was created from a
    // problem report and has now been cancelled.
    type SourceReport = { reporter: { id: string } };
    const sourceReport = (wo as unknown as { sourceReport: SourceReport | null }).sourceReport;
    if (sourceReport?.reporter?.id) {
      await this.notifications.notify({
        recipientId: sourceReport.reporter.id,
        type: NotificationType.LINKED_WO_CLOSED,
        title: 'Votre signalement a été archivé',
        summary:
          `L'ordre de travail ${wo.referenceNumber}, issu de votre signalement, ` +
          `a été annulé.`,
        entityType: 'WorkOrder',
        entityId: id,
      });
    }

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

  async getAnalytics(periodDays: number, categoryId?: string) {
    const terminalStatuses = [WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED];
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const now = new Date();
    const catFilter = categoryId ? { asset: { categoryId } } : {};

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
      correctiveWOs,
      techKpiWOs,
      reportsInPeriod,
      preventiveWOsInPeriod,
      checklistItemsDone,
      sourceDistRaw,
      rejectionRaw,
      reassignmentCount,
      postPreventiveWindowConfig,
      preventiveWOsPerPlan,
      checklistItemsPerPlanItem,
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
        where: { status: WorkOrderStatus.CLOSED, closedAt: { gte: since }, ...catFilter },
      }),
      this.prisma.workOrder.count({
        where: { status: WorkOrderStatus.CANCELLED, cancelledAt: { gte: since }, ...catFilter },
      }),
      this.prisma.workOrder.findMany({
        where: { status: WorkOrderStatus.CLOSED, closedAt: { not: null }, ...catFilter },
        select: { createdAt: true, closedAt: true },
      }),
      this.prisma.workOrder.findMany({
        where: {
          OR: [
            { status: WorkOrderStatus.CLOSED, closedAt: { gte: since } },
            { status: WorkOrderStatus.CANCELLED, cancelledAt: { gte: since } },
          ],
          ...catFilter,
        },
        select: {
          assetId: true,
          asset: { select: { name: true } },
          contractorCost: true,
          interventionLogs: {
            select: { activeDurationMinutes: true, hourlyRateAtTime: true },
          },
          stockMovements: {
            where: { type: StockMovementType.OUTGOING },
            select: { quantity: true, unitCostAtTime: true },
          },
        },
      }),
      // All closed corrective WOs (all-time) for MTBF/MTTR/recurring-failure
      this.prisma.workOrder.findMany({
        where: { type: WorkOrderType.CORRECTIVE, status: WorkOrderStatus.CLOSED, closedAt: { not: null }, ...catFilter },
        select: { assetId: true, asset: { select: { name: true } }, createdAt: true, closedAt: true },
        orderBy: [{ assetId: 'asc' }, { createdAt: 'asc' }],
      }),
      // Closed WOs in period with principal technician
      this.prisma.workOrder.findMany({
        where: { status: WorkOrderStatus.CLOSED, closedAt: { gte: since }, principalTechnicianId: { not: null }, ...catFilter },
        select: {
          principalTechnicianId: true,
          principalTechnician: { select: { id: true, name: true } },
          createdAt: true,
          validationActions: { select: { action: true, rejectionReason: true } },
          onHoldPeriods: { select: { id: true } },
          interventionLogs: {
            select: { technicianId: true, activeDurationMinutes: true, startedAt: true },
            orderBy: { startedAt: 'asc' },
          },
        },
      }),
      // Problem reports in period (§9.8: includes submittedDespiteWarning and
      // closure result of derived WOs for reportAccuracyRate computation)
      this.prisma.problemReport.findMany({
        where: { createdAt: { gte: since } },
        select: {
          status: true,
          processedAt: true,
          createdAt: true,
          submittedDespiteWarning: true,
          derivedWorkOrders: {
            select: {
              id: true,
              status: true,
              interventionLogs: { select: { result: true } },
            },
          },
        },
      }),
      // Preventive WOs in period
      this.prisma.workOrder.findMany({
        where: { type: WorkOrderType.PREVENTIVE, createdAt: { gte: since }, ...catFilter },
        select: { status: true, assetId: true, closedAt: true },
      }),
      // Checklist items completed in period
      this.prisma.workOrderChecklistItem.findMany({
        where: {
          status: { in: [ChecklistItemStatus.DONE, ChecklistItemStatus.ANOMALY_DETECTED, ChecklistItemStatus.NOT_APPLICABLE] },
          workOrder: { status: WorkOrderStatus.CLOSED, closedAt: { gte: since }, ...catFilter },
        },
        select: { status: true },
      }),
      // Source distribution in period
      this.prisma.workOrder.groupBy({
        by: ['sourceType'],
        where: { createdAt: { gte: since }, ...catFilter },
        _count: { id: true },
      }),
      // Rejection reason distribution in period
      this.prisma.workOrderValidation.groupBy({
        by: ['rejectionReason'],
        where: { action: 'REJECTED', createdAt: { gte: since }, rejectionReason: { not: null } },
        _count: { id: true },
      }),
      // Reassignment count in period
      this.prisma.workOrderReassignment.count({ where: { createdAt: { gte: since } } }),
      // §9.8: window config for post-preventive corrective KPI
      this.prisma.systemConfig.findUnique({ where: { key: 'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS' } }),
      // §1.3: per-plan compliance — preventive WOs in period that have a source plan
      this.prisma.workOrder.findMany({
        where: { type: WorkOrderType.PREVENTIVE, createdAt: { gte: since }, sourcePlanId: { not: null }, ...catFilter },
        select: {
          sourcePlanId: true,
          sourcePlan: { select: { id: true, title: true } },
          status: true,
          dueDate: true,
          closedAt: true,
        },
      }),
      // §1.3: per-checklist-item anomaly — executed items linked to a plan template item
      this.prisma.workOrderChecklistItem.findMany({
        where: {
          sourcePlanItemId: { not: null },
          status: { in: [ChecklistItemStatus.DONE, ChecklistItemStatus.ANOMALY_DETECTED] },
          workOrder: { status: WorkOrderStatus.CLOSED, closedAt: { gte: since }, ...catFilter },
        },
        select: {
          sourcePlanItemId: true,
          status: true,
          sourcePlanItem: { select: { id: true, description: true } },
        },
      }),
    ]);

    // ── Existing KPIs ─────────────────────────────────────────────────────────
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

    const costByAsset = new Map<string, { assetName: string; laborCost: number; partsCost: number; contractorCost: number }>();
    const costSummaryTotals = { contractorCost: 0, laborCost: 0, partsCost: 0 };

    for (const wo of costWOs) {
      const cost = calculateWorkOrderCostSummary(wo as never);
      costSummaryTotals.contractorCost += cost.contractorCost;
      costSummaryTotals.laborCost += cost.laborCost;
      costSummaryTotals.partsCost += cost.partsCost;

      const existing = costByAsset.get(wo.assetId) ?? { assetName: wo.asset.name, laborCost: 0, partsCost: 0, contractorCost: 0 };
      existing.laborCost += cost.laborCost;
      existing.partsCost += cost.partsCost;
      existing.contractorCost += cost.contractorCost;
      costByAsset.set(wo.assetId, existing);
    }

    const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    costSummaryTotals.contractorCost = round2(costSummaryTotals.contractorCost);
    costSummaryTotals.laborCost = round2(costSummaryTotals.laborCost);
    costSummaryTotals.partsCost = round2(costSummaryTotals.partsCost);
    const totalCost = round2(costSummaryTotals.contractorCost + costSummaryTotals.laborCost + costSummaryTotals.partsCost);

    // ── Asset KPIs ────────────────────────────────────────────────────────────
    // MTBF: mean time between corrective failures per asset, then average across assets
    const wosByAsset = new Map<string, { createdAt: Date; closedAt: Date }[]>();
    for (const wo of correctiveWOs) {
      const list = wosByAsset.get(wo.assetId) ?? [];
      list.push({ createdAt: wo.createdAt, closedAt: wo.closedAt! });
      wosByAsset.set(wo.assetId, list);
    }

    const mtbfIntervals: number[] = [];
    const mttrValues: number[] = [];
    const failureCountInPeriod = new Map<string, { assetName: string; count: number; lastDate: Date }>();

    for (const wo of correctiveWOs) {
      const durationMs = wo.closedAt!.getTime() - wo.createdAt.getTime();
      mttrValues.push(durationMs / (1000 * 60 * 60));

      if (wo.createdAt >= since) {
        const existing = failureCountInPeriod.get(wo.assetId);
        if (!existing) {
          failureCountInPeriod.set(wo.assetId, { assetName: wo.asset.name, count: 1, lastDate: wo.createdAt });
        } else {
          existing.count += 1;
          if (wo.createdAt > existing.lastDate) existing.lastDate = wo.createdAt;
        }
      }
    }

    for (const wos of wosByAsset.values()) {
      for (let i = 1; i < wos.length; i++) {
        const gapMs = wos[i].createdAt.getTime() - wos[i - 1].closedAt.getTime();
        if (gapMs > 0) mtbfIntervals.push(gapMs / (1000 * 60 * 60 * 24));
      }
    }

    const globalMtbfDays = mtbfIntervals.length > 0
      ? Math.round((mtbfIntervals.reduce((s, v) => s + v, 0) / mtbfIntervals.length) * 10) / 10
      : null;
    const globalMttrHours = mttrValues.length > 0
      ? Math.round((mttrValues.reduce((s, v) => s + v, 0) / mttrValues.length) * 10) / 10
      : null;

    const topFailingAssets = [...failureCountInPeriod.entries()]
      .map(([assetId, v]) => ({ assetId, assetName: v.assetName, failureCount: v.count, lastFailureDate: v.lastDate.toISOString() }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 10);

    const topCostAssets = [...costByAsset.entries()]
      .map(([assetId, v]) => ({
        assetId,
        assetName: v.assetName,
        totalCost: round2(v.laborCost + v.partsCost + v.contractorCost),
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    // §1.4 / §2.7: per-asset breakdown — downtime, MTBF, MTTR, cost, failure count
    const perAssetMttrMap = new Map<string, { name: string; durationSumMs: number; count: number }>();
    for (const wo of correctiveWOs) {
      const durationMs = wo.closedAt!.getTime() - wo.createdAt.getTime();
      const entry = perAssetMttrMap.get(wo.assetId) ?? { name: wo.asset.name, durationSumMs: 0, count: 0 };
      entry.durationSumMs += durationMs;
      entry.count += 1;
      perAssetMttrMap.set(wo.assetId, entry);
    }

    const perAssetDowntimeMs = new Map<string, number>();
    for (const wo of correctiveWOs) {
      if (wo.closedAt && wo.closedAt >= since) {
        const prev = perAssetDowntimeMs.get(wo.assetId) ?? 0;
        perAssetDowntimeMs.set(wo.assetId, prev + (wo.closedAt.getTime() - wo.createdAt.getTime()));
      }
    }

    const allAssetIds = new Set([
      ...failureCountInPeriod.keys(),
      ...costByAsset.keys(),
    ]);

    const perAsset = [...allAssetIds].map((assetId) => {
      const failure = failureCountInPeriod.get(assetId);
      const cost = costByAsset.get(assetId);
      const mttrEntry = perAssetMttrMap.get(assetId);
      const assetWos = wosByAsset.get(assetId) ?? [];

      const mttrHours = mttrEntry && mttrEntry.count > 0
        ? Math.round((mttrEntry.durationSumMs / mttrEntry.count / 3_600_000) * 10) / 10
        : null;

      const mtbfIntervalsDays: number[] = [];
      for (let i = 1; i < assetWos.length; i++) {
        const gapMs = assetWos[i].createdAt.getTime() - assetWos[i - 1].closedAt.getTime();
        if (gapMs > 0) mtbfIntervalsDays.push(gapMs / 86_400_000);
      }
      const mtbfDays = mtbfIntervalsDays.length > 0
        ? Math.round((mtbfIntervalsDays.reduce((s, v) => s + v, 0) / mtbfIntervalsDays.length) * 10) / 10
        : null;

      const downtimeMs = perAssetDowntimeMs.get(assetId) ?? 0;
      const downtimeHours = Math.round((downtimeMs / 3_600_000) * 10) / 10;

      const partsCost = cost ? round2(cost.partsCost) : 0;
      const totalCost = cost ? round2(cost.laborCost + cost.partsCost + cost.contractorCost) : 0;

      return {
        assetId,
        assetName: failure?.assetName ?? cost?.assetName ?? mttrEntry?.name ?? assetId,
        failureCount: failure?.count ?? 0,
        lastFailureDate: failure?.lastDate.toISOString() ?? null,
        downtimeHours,
        mttrHours,
        mtbfDays,
        partsCost,
        totalCost,
      };
    }).sort((a, b) => b.failureCount - a.failureCount || b.totalCost - a.totalCost);

    const preventiveClosedCount = preventiveWOsInPeriod.filter((w) => w.status === WorkOrderStatus.CLOSED).length;
    const preventiveComplianceRate = preventiveWOsInPeriod.length > 0
      ? Math.round((preventiveClosedCount / preventiveWOsInPeriod.length) * 1000) / 1000
      : null;

    // ── §9.8: Taux correctif post-préventif ──────────────────────────────────
    const postPreventiveWindowDays = parseInt(postPreventiveWindowConfig?.value ?? '7', 10);
    const closedPreventiveList = preventiveWOsInPeriod.filter(
      (w) => w.status === WorkOrderStatus.CLOSED && w.closedAt !== null,
    );
    let postPreventiveCorrectiveRate: number | null = null;
    if (closedPreventiveList.length > 0) {
      const windowMs = postPreventiveWindowDays * 24 * 60 * 60 * 1000;
      const affectedAssetIds = [...new Set(closedPreventiveList.map((w) => w.assetId))];
      const windowStart = new Date(
        Math.min(...closedPreventiveList.map((w) => w.closedAt!.getTime())),
      );
      const windowEnd = new Date(
        Math.max(...closedPreventiveList.map((w) => w.closedAt!.getTime())) + windowMs,
      );
      const correctiveFollowUps = await this.prisma.workOrder.findMany({
        where: {
          type: WorkOrderType.CORRECTIVE,
          assetId: { in: affectedAssetIds },
          createdAt: { gte: windowStart, lte: windowEnd },
          ...catFilter,
        },
        select: { assetId: true, createdAt: true },
      });
      let triggeredCount = 0;
      for (const preventive of closedPreventiveList) {
        const closedMs = preventive.closedAt!.getTime();
        const hasFollowUp = correctiveFollowUps.some(
          (c) =>
            c.assetId === preventive.assetId &&
            c.createdAt.getTime() >= closedMs &&
            c.createdAt.getTime() <= closedMs + windowMs,
        );
        if (hasFollowUp) triggeredCount++;
      }
      postPreventiveCorrectiveRate =
        Math.round((triggeredCount / closedPreventiveList.length) * 1000) / 1000;
    }

    // ── Technician KPIs ───────────────────────────────────────────────────────
    const techMap = new Map<string, {
      id: string; name: string; closedCount: number;
      totalActiveMins: number; activeMinsCount: number;
      firstPassCount: number; totalHoldPeriods: number;
      totalResponseMs: number; responseCount: number;
      // §9.8: track each REJECTED validation action's reason for per-technician breakdown
      rejectionsByReason: Map<string, number>;
    }>();

    for (const wo of techKpiWOs) {
      const techId = wo.principalTechnicianId!;
      const entry = techMap.get(techId) ?? {
        id: techId, name: wo.principalTechnician?.name ?? techId,
        closedCount: 0, totalActiveMins: 0, activeMinsCount: 0,
        firstPassCount: 0, totalHoldPeriods: 0, totalResponseMs: 0, responseCount: 0,
        rejectionsByReason: new Map<string, number>(),
      };
      entry.closedCount += 1;
      entry.totalHoldPeriods += wo.onHoldPeriods.length;

      const wasRejected = wo.validationActions.some((a) => a.action === 'REJECTED');
      if (!wasRejected) entry.firstPassCount += 1;

      // §9.8: accumulate rejection reason counts per technician
      for (const va of wo.validationActions) {
        if (va.action === 'REJECTED' && va.rejectionReason) {
          entry.rejectionsByReason.set(
            va.rejectionReason,
            (entry.rejectionsByReason.get(va.rejectionReason) ?? 0) + 1,
          );
        }
      }

      for (const log of wo.interventionLogs) {
        if (log.activeDurationMinutes !== null) {
          entry.totalActiveMins += log.activeDurationMinutes;
          entry.activeMinsCount += 1;
        }
      }

      const firstLog = wo.interventionLogs[0];
      if (firstLog) {
        entry.totalResponseMs += firstLog.startedAt.getTime() - wo.createdAt.getTime();
        entry.responseCount += 1;
      }

      techMap.set(techId, entry);
    }

    const technicianKpis = [...techMap.values()].map((t) => {
      const rejectionCount = [...t.rejectionsByReason.values()].reduce((s, v) => s + v, 0);
      const rejectionRate = t.closedCount > 0
        ? Math.round(rejectionCount / t.closedCount * 1000) / 1000
        : null;
      const rejectionRateByCategory = Object.fromEntries(
        [...t.rejectionsByReason.entries()].map(([reason, count]) => [
          reason,
          {
            count,
            rate: t.closedCount > 0 ? Math.round(count / t.closedCount * 1000) / 1000 : 0,
          },
        ]),
      );
      return {
        technicianId: t.id,
        name: t.name,
        closedCount: t.closedCount,
        rejectionCount,
        rejectionRate,
        rejectionRateByCategory,
        avgActiveDurationMinutes: t.activeMinsCount > 0
          ? Math.round(t.totalActiveMins / t.activeMinsCount * 10) / 10 : null,
        firstPassRate: t.closedCount > 0
          ? Math.round(t.firstPassCount / t.closedCount * 1000) / 1000 : null,
        avgHoldPerWo: t.closedCount > 0
          ? Math.round(t.totalHoldPeriods / t.closedCount * 10) / 10 : null,
        avgResponseTimeHours: t.responseCount > 0
          ? Math.round(t.totalResponseMs / t.responseCount / (1000 * 60 * 60) * 10) / 10 : null,
      };
    }).sort((a, b) => b.closedCount - a.closedCount);

    // ── Requester analytics ───────────────────────────────────────────────────
    const totalReports = reportsInPeriod.length;
    const convertedReports = reportsInPeriod.filter((r) => r.derivedWorkOrders.length > 0).length;
    const conversionRate = totalReports > 0 ? Math.round(convertedReports / totalReports * 1000) / 1000 : null;

    const processedReports = reportsInPeriod.filter((r) => r.processedAt !== null);
    let reportToActionAvgDays: number | null = null;
    if (processedReports.length > 0) {
      const totalMs = processedReports.reduce(
        (s, r) => s + (r.processedAt!.getTime() - r.createdAt.getTime()), 0,
      );
      reportToActionAvgDays = Math.round(totalMs / processedReports.length / (1000 * 60 * 60 * 24) * 10) / 10;
    }

    // §9.8 — report accuracy: % of converted reports whose derived WO was closed
    // with InterventionResult.RESOLVED. Denominator is closed conversions only
    // (pending WOs have not yet produced a closure result).
    const closedConversions = reportsInPeriod.filter((r) =>
      r.derivedWorkOrders.some((wo) => wo.status === WorkOrderStatus.CLOSED),
    );
    const resolvedConversions = closedConversions.filter((r) =>
      r.derivedWorkOrders.some(
        (wo) =>
          wo.status === WorkOrderStatus.CLOSED &&
          wo.interventionLogs.some((log) => log.result === InterventionResult.RESOLVED),
      ),
    ).length;
    const reportAccuracyRate: number | null =
      closedConversions.length > 0
        ? Math.round((resolvedConversions / closedConversions.length) * 1000) / 1000
        : null;

    // §9.8 — duplicate submission rate: % of reports where the requester clicked
    // "submit anyway" after seeing the duplicate-WO banner.
    const reportsWithWarning = reportsInPeriod.filter((r) => r.submittedDespiteWarning).length;
    const duplicateSubmissionRate: number | null =
      totalReports > 0
        ? Math.round((reportsWithWarning / totalReports) * 1000) / 1000
        : null;

    // ── Preventive plan efficiency ────────────────────────────────────────────
    const anomalyItems = checklistItemsDone.filter((c) => c.status === ChecklistItemStatus.ANOMALY_DETECTED).length;
    const anomalyRate = checklistItemsDone.length > 0
      ? Math.round(anomalyItems / checklistItemsDone.length * 1000) / 1000
      : null;

    // §1.3 — Per-plan compliance rate and per-checklist-item anomaly rate
    const compliancePerPlan = computeCompliancePerPlan(preventiveWOsPerPlan);
    const anomalyPerChecklistItem = computeAnomalyPerChecklistItem(checklistItemsPerPlanItem);

    // ── Operational overview ──────────────────────────────────────────────────
    const sourceDistribution = Object.fromEntries(sourceDistRaw.map((r) => [r.sourceType, r._count.id]));
    const rejectionReasonDistribution = Object.fromEntries(
      rejectionRaw.map((r) => [r.rejectionReason!, r._count.id]),
    );

    const totalHoldPeriodsAll = techKpiWOs.reduce((s, wo) => s + wo.onHoldPeriods.length, 0);
    const avgHoldPeriodsPerWo = techKpiWOs.length > 0
      ? Math.round(totalHoldPeriodsAll / techKpiWOs.length * 10) / 10
      : null;

    return {
      periodDays,
      categoryId: categoryId ?? null,
      summary: { total, open, overdue, closedThisPeriod, cancelledThisPeriod, resolutionRate },
      byStatus,
      byType,
      byPriority,
      avgResolutionDays,
      costSummary: { ...costSummaryTotals, totalCost },
      assetKpis: {
        globalMtbfDays,
        globalMttrHours,
        topByFailureFrequency: topFailingAssets,
        topByCost: topCostAssets,
        preventiveComplianceRate,
        totalMaintenanceCost: totalCost,
        perAsset,
      },
      technicianKpis,
      requesterAnalytics: {
        totalReportsSubmitted: totalReports,
        totalConverted: convertedReports,
        conversionRate,
        reportToActionAvgDays,
        reportAccuracyRate,
        duplicateSubmissionRate,
      },
      preventivePlanEfficiency: {
        complianceRate: preventiveComplianceRate,
        anomalyRate,
        totalPreventiveWOs: preventiveWOsInPeriod.length,
        closedPreventiveWOs: preventiveClosedCount,
        postPreventiveCorrectiveRate,
        postPreventiveCorrectiveWindowDays: postPreventiveWindowDays,
        compliancePerPlan,
        anomalyPerChecklistItem,
      },
      operationalOverview: {
        sourceDistribution,
        rejectionReasonDistribution,
        reassignmentCount,
        avgHoldPeriodsPerWo,
      },
    };
  }

  async getAnalyticsPdf(periodDays: number, categoryId?: string): Promise<Buffer> {
    const analytics = await this.getAnalytics(periodDays, categoryId);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Synthese analytique maintenance', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666666').text(`Periode: ${analytics.periodDays} jours`);
      doc.text(`Categorie: ${analytics.categoryId ?? 'Toutes'}`);
      doc.text(`Genere le: ${new Date().toISOString()}`);
      doc.fillColor('#000000');

      doc.moveDown();
      doc.fontSize(13).text('Indicateurs globaux', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11)
        .text(`Total OT: ${analytics.summary.total}`)
        .text(`OT ouverts: ${analytics.summary.open}`)
        .text(`OT en retard: ${analytics.summary.overdue}`)
        .text(`OT clos (periode): ${analytics.summary.closedThisPeriod}`)
        .text(`OT annules (periode): ${analytics.summary.cancelledThisPeriod}`)
        .text(
          `Taux de resolution: ${analytics.summary.resolutionRate !== null
            ? `${Math.round(analytics.summary.resolutionRate * 1000) / 10}%`
            : 'N/A'}`,
        );

      doc.moveDown();
      doc.fontSize(13).text('Couts maintenance', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11)
        .text(`Main d'oeuvre: ${analytics.costSummary.laborCost}`)
        .text(`Pieces: ${analytics.costSummary.partsCost}`)
        .text(`Sous-traitance: ${analytics.costSummary.contractorCost}`)
        .text(`Total: ${analytics.costSummary.totalCost}`);

      doc.moveDown();
      doc.fontSize(13).text('Top actifs en panne (max 10)', { underline: true });
      doc.moveDown(0.5);

      if (analytics.assetKpis.topByFailureFrequency.length === 0) {
        doc.fontSize(11).text('Aucune donnee sur la periode.');
      } else {
        analytics.assetKpis.topByFailureFrequency.forEach((item, index) => {
          doc.fontSize(10).text(
            `${index + 1}. ${item.assetName} — pannes: ${item.failureCount} — derniere panne: ${new Date(item.lastFailureDate).toLocaleDateString('fr-FR')}`,
          );
        });
      }

      doc.end();
    });
  }

  async getRecurringFailureAssets(thresholdCount: number, periodDays: number) {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    const wos = await this.prisma.workOrder.findMany({
      where: { type: WorkOrderType.CORRECTIVE, createdAt: { gte: since } },
      select: { assetId: true, asset: { select: { name: true, qrCodeIdentifier: true } }, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const byAsset = new Map<string, { assetName: string; qrCode: string; count: number; lastFailureDate: Date }>();
    for (const wo of wos) {
      const entry = byAsset.get(wo.assetId) ?? {
        assetName: wo.asset.name,
        qrCode: wo.asset.qrCodeIdentifier,
        count: 0,
        lastFailureDate: wo.createdAt,
      };
      entry.count += 1;
      if (wo.createdAt > entry.lastFailureDate) entry.lastFailureDate = wo.createdAt;
      byAsset.set(wo.assetId, entry);
    }

    return [...byAsset.entries()]
      .filter(([, v]) => v.count >= thresholdCount)
      .map(([assetId, v]) => ({
        assetId,
        assetName: v.assetName,
        qrCode: v.qrCode,
        failureCount: v.count,
        lastFailureDate: v.lastFailureDate.toISOString(),
      }))
      .sort((a, b) => b.failureCount - a.failureCount);
  }

  async autoEscalateOverduePriorities(): Promise<{ checked: number; escalated: number; criticalNotified: number }> {
    const now = new Date();

    // §4.3: CRITICAL WOs that are overdue do NOT escalate further — they trigger an
    // immediate supervisor notification instead.
    const overdueCritical = await this.repo.findOverdueCritical(now);
    for (const wo of overdueCritical) {
      this.logger.warn(`CRITICAL WO ${wo.referenceNumber} is overdue — notifying supervisors`);
      await this.notifications.notifySupervisors(
        NotificationType.WO_OVERDUE,
        'Ordre de travail CRITIQUE en retard',
        `L'ordre de travail CRITIQUE ${wo.referenceNumber} a dépassé sa date d'échéance.`,
        'WorkOrder',
        wo.id,
      );
    }

    const overdue = await this.repo.findOverdueForEscalation(now);

    if (overdue.length === 0 && overdueCritical.length === 0) {
      this.logger.debug('Automatic priority escalation: no overdue work orders eligible');
      return { checked: 0, escalated: 0, criticalNotified: 0 };
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

    return { checked: overdue.length, escalated, criticalNotified: overdueCritical.length };
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
