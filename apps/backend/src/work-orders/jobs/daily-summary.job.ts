import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { SystemConfigService } from '../../system-config/system-config.service';
import { WorkOrderStatus, WorkOrderPriority, ProblemReportStatus, Role } from '@gmao/db';
import { JobLoggerService } from '../../job-logger/job-logger.service';

const ACTIVE_STATUSES = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
] as const;

const MAX_OVERDUE_LIST = 10;
const MAX_ON_HOLD_LIST = 10;
const MAX_LOW_STOCK_LIST = 10;
const MAX_CRITICAL_DEFERRED_LIST = 10;
const CRITICAL_DEFERRED_DAYS = 14;

const JOB_NAME = 'daily-summary';

export interface DailySummaryOverdueItem {
  referenceNumber: string;
  priority: WorkOrderPriority;
  dueDate: string;
  assetName: string;
}

export interface DailySummaryOnHoldItem {
  referenceNumber: string;
  holdDurationMinutes: number;
  assetName: string;
}

export interface DailySummaryLowStockItem {
  name: string;
  referenceCode: string;
  currentStock: number;
  minimumStockThreshold: number;
}

export interface DailySummaryCriticalDeferredItem {
  referenceNumber: string;
  assetName: string;
  deferredAt: string;
  daysDeferred: number;
}

export interface DailySummaryMetrics {
  openCount: number;
  inProgressCount: number;
  pendingValidationCount: number;
  onHoldCount: number;
  overdueCount: number;
  criticalCount: number;
  closedTodayCount: number;
  deferredReportCount: number;
  criticalDeferredCount: number;
  lowStockCount: number;
  overdueList: DailySummaryOverdueItem[];
  onHoldItems: DailySummaryOnHoldItem[];
  lowStockItems: DailySummaryLowStockItem[];
  criticalDeferredItems: DailySummaryCriticalDeferredItem[];
}

@Injectable()
export class DailySummaryJob {
  private readonly logger = new Logger(DailySummaryJob.name);
  private readonly DEFAULT_HOUR = 17;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly systemConfig: SystemConfigService,
    private readonly jobLogger: JobLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    await this.jobLogger.recordStart(JOB_NAME);
    try {
      await this.doRun();
      await this.jobLogger.recordSuccess(JOB_NAME);
    } catch (err) {
      await this.jobLogger.recordFailure(JOB_NAME, err as Error);
      throw err;
    }
  }

  private async doRun(): Promise<void> {
    const configuredHour = await this.getConfiguredHour();
    const currentHour = new Date().getHours();

    if (currentHour !== configuredHour) {
      this.logger.debug(
        `Daily summary skipped — current hour ${currentHour} !== configured hour ${configuredHour}`,
      );
      return;
    }

    this.logger.log('Running daily supervisor summary job');

    const [metrics, supervisors] = await Promise.all([
      this.collectMetrics(),
      this.getActiveSupervisors(),
    ]);

    if (supervisors.length === 0) {
      this.logger.warn('Daily summary: no active supervisors found, skipping');
      return;
    }

    const date = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    await Promise.all(
      supervisors.map((supervisor) =>
        this.mail.enqueue({
          to: supervisor.email,
          template: 'daily-summary',
          context: {
            supervisorName: supervisor.name,
            date,
            ...this.buildContextForSupervisor(metrics, supervisor),
          },
        }),
      ),
    );

    this.logger.log(
      `Daily summary enqueued for ${supervisors.length} supervisor(s) — ` +
        `open=${metrics.openCount}, overdue=${metrics.overdueCount}, ` +
        `critical=${metrics.criticalCount}, pendingValidation=${metrics.pendingValidationCount}, ` +
        `deferred=${metrics.deferredReportCount}, criticalDeferred=${metrics.criticalDeferredCount}, ` +
        `lowStock=${metrics.lowStockCount}`,
    );
  }

  private buildContextForSupervisor(
    metrics: DailySummaryMetrics,
    supervisor: { roles: Role[] },
  ): DailySummaryMetrics & { hasStorekeeperRole: boolean } {
    const hasStorekeeperRole = supervisor.roles.includes(Role.STOREKEEPER);
    return {
      ...metrics,
      hasStorekeeperRole,
      lowStockCount: hasStorekeeperRole ? metrics.lowStockCount : 0,
      lowStockItems: hasStorekeeperRole ? metrics.lowStockItems : [],
    };
  }

  async getConfiguredHour(): Promise<number> {
    const raw = await this.systemConfig.get('DAILY_SUMMARY_HOUR');
    if (raw === null) return this.DEFAULT_HOUR;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 23) return this.DEFAULT_HOUR;
    return parsed;
  }

  async collectMetrics(): Promise<DailySummaryMetrics> {
    const now = new Date();
    const criticalDeferredCutoff = new Date(now.getTime() - CRITICAL_DEFERRED_DAYS * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const [
      openCount,
      inProgressCount,
      pendingValidationCount,
      onHoldCount,
      overdueCount,
      criticalCount,
      closedTodayCount,
      deferredReportCount,
      criticalDeferredCount,
    ] = await this.prisma.$transaction([
      this.prisma.workOrder.count({
        where: { status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED] } },
      }),
      this.prisma.workOrder.count({
        where: { status: WorkOrderStatus.IN_PROGRESS },
      }),
      this.prisma.workOrder.count({
        where: { status: WorkOrderStatus.PENDING_VALIDATION },
      }),
      this.prisma.workOrder.count({
        where: { status: WorkOrderStatus.ON_HOLD },
      }),
      this.prisma.workOrder.count({
        where: {
          dueDate: { lt: now },
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          priority: WorkOrderPriority.CRITICAL,
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          status: WorkOrderStatus.CLOSED,
          closedAt: { gte: startOfToday },
        },
      }),
      this.prisma.problemReport.count({
        where: { status: ProblemReportStatus.DEFERRED },
      }),
      this.prisma.problemReport.count({
        where: {
          status: ProblemReportStatus.DEFERRED,
          deferredAt: { not: null, lte: criticalDeferredCutoff },
        },
      }),
    ]);

    const [overdueRaw, onHoldRaw, lowStockParts, criticalDeferredRaw] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: {
          dueDate: { lt: now },
          status: { in: [...ACTIVE_STATUSES] },
        },
        orderBy: { dueDate: 'asc' },
        take: MAX_OVERDUE_LIST,
        select: {
          referenceNumber: true,
          priority: true,
          dueDate: true,
          asset: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { status: WorkOrderStatus.ON_HOLD },
        orderBy: { updatedAt: 'asc' },
        take: MAX_ON_HOLD_LIST,
        select: {
          referenceNumber: true,
          asset: { select: { name: true } },
          onHoldPeriods: {
            where: { resumedAt: null },
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { startedAt: true },
          },
        },
      }),
      this.prisma.part.findMany({
        where: { minimumStockThreshold: { gt: 0 } },
        orderBy: { currentStock: 'asc' },
        take: MAX_LOW_STOCK_LIST,
        select: {
          name: true,
          referenceCode: true,
          currentStock: true,
          minimumStockThreshold: true,
        },
      }),
      this.prisma.problemReport.findMany({
        where: {
          status: ProblemReportStatus.DEFERRED,
          deferredAt: { not: null, lte: criticalDeferredCutoff },
        },
        orderBy: { deferredAt: 'asc' },
        take: MAX_CRITICAL_DEFERRED_LIST,
        select: {
          referenceNumber: true,
          deferredAt: true,
          asset: { select: { name: true } },
        },
      }),
    ]);

    const lowStockCount = lowStockParts.filter(
      (p) => p.currentStock < p.minimumStockThreshold,
    ).length;

    const lowStockItems: DailySummaryLowStockItem[] = lowStockParts
      .filter((part) => part.currentStock < part.minimumStockThreshold)
      .map((part) => ({
        name: part.name,
        referenceCode: part.referenceCode,
        currentStock: part.currentStock,
        minimumStockThreshold: part.minimumStockThreshold,
      }));

    const overdueList: DailySummaryOverdueItem[] = overdueRaw.map((wo) => ({
      referenceNumber: wo.referenceNumber,
      priority: wo.priority,
      dueDate: wo.dueDate!.toISOString(),
      assetName: wo.asset.name,
    }));

    const onHoldItems: DailySummaryOnHoldItem[] = onHoldRaw.map((wo) => {
      const activePeriod = wo.onHoldPeriods[0] ?? null;
      const holdDurationMinutes = activePeriod
        ? Math.round((now.getTime() - activePeriod.startedAt.getTime()) / 60_000)
        : 0;
      return {
        referenceNumber: wo.referenceNumber,
        holdDurationMinutes,
        assetName: wo.asset.name,
      };
    });

    const criticalDeferredItems: DailySummaryCriticalDeferredItem[] = criticalDeferredRaw.map((report) => {
      const deferredAt = report.deferredAt!;
      const daysDeferred = Math.floor((now.getTime() - deferredAt.getTime()) / (24 * 60 * 60 * 1000));
      return {
        referenceNumber: report.referenceNumber,
        assetName: report.asset.name,
        deferredAt: deferredAt.toISOString(),
        daysDeferred,
      };
    });

    return {
      openCount,
      inProgressCount,
      pendingValidationCount,
      onHoldCount,
      overdueCount,
      criticalCount,
      closedTodayCount,
      deferredReportCount,
      criticalDeferredCount,
      lowStockCount,
      overdueList,
      onHoldItems,
      lowStockItems,
      criticalDeferredItems,
    };
  }

  async getActiveSupervisors(): Promise<Array<{ id: string; email: string; name: string; roles: Role[] }>> {
    return this.prisma.user.findMany({
      where: { roles: { has: 'SUPERVISOR' }, isActive: true },
      select: { id: true, email: true, name: true, roles: true },
    });
  }
}
