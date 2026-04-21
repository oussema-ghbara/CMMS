import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { SystemConfigService } from '../../system-config/system-config.service';
import { WorkOrderStatus, WorkOrderPriority } from '@gmao/db';
import { JobLoggerService } from '../../job-logger/job-logger.service';

const ACTIVE_STATUSES = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
] as const;

const JOB_NAME = 'daily-summary';

export interface DailySummaryMetrics {
  openCount: number;
  inProgressCount: number;
  pendingValidationCount: number;
  onHoldCount: number;
  overdueCount: number;
  criticalCount: number;
  closedTodayCount: number;
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
            ...metrics,
          },
        }),
      ),
    );

    this.logger.log(
      `Daily summary enqueued for ${supervisors.length} supervisor(s) — ` +
        `open=${metrics.openCount}, overdue=${metrics.overdueCount}, ` +
        `critical=${metrics.criticalCount}, pendingValidation=${metrics.pendingValidationCount}`,
    );
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
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const [
      openCount,
      inProgressCount,
      pendingValidationCount,
      onHoldCount,
      overdueCount,
      criticalCount,
      closedTodayCount,
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
    ]);

    return {
      openCount,
      inProgressCount,
      pendingValidationCount,
      onHoldCount,
      overdueCount,
      criticalCount,
      closedTodayCount,
    };
  }

  async getActiveSupervisors(): Promise<Array<{ id: string; email: string; name: string }>> {
    return this.prisma.user.findMany({
      where: { roles: { has: 'SUPERVISOR' }, isActive: true },
      select: { id: true, email: true, name: true },
    });
  }
}
