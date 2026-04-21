import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { WorkOrderStatus, NotificationType } from '@gmao/db';
import { JobLoggerService } from '../../job-logger/job-logger.service';

const ACTIVE_STATUSES = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
] as const;

// Avoid re-notifying within the same 23-hour window (job runs hourly).
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

const JOB_NAME = 'due-date-approaching';

@Injectable()
export class DueDateApproachingJob {
  private readonly logger = new Logger(DueDateApproachingJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const approachingWOs = await this.prisma.workOrder.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        dueDate: { gte: now, lte: in24h },
        principalTechnicianId: { not: null },
      },
      select: {
        id: true,
        referenceNumber: true,
        dueDate: true,
        principalTechnicianId: true,
      },
    });

    if (approachingWOs.length === 0) {
      this.logger.debug('DueDateApproachingJob: no WOs approaching due date');
      return;
    }

    // Exclude WOs already notified within the deduplication window to avoid
    // spamming the technician every hour for the same WO.
    const dedupSince = new Date(now.getTime() - DEDUP_WINDOW_MS);
    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.DUE_DATE_APPROACHING,
        entityType: 'WorkOrder',
        entityId: { in: approachingWOs.map((wo) => wo.id) },
        createdAt: { gte: dedupSince },
      },
      select: { entityId: true },
    });
    const alreadyNotifiedIds = new Set(alreadyNotified.map((n) => n.entityId));

    const toNotify = approachingWOs.filter((wo) => !alreadyNotifiedIds.has(wo.id));

    let notified = 0;
    for (const wo of toNotify) {
      const dueDateFormatted = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(wo.dueDate!);

      await this.notifications.notify({
        recipientId: wo.principalTechnicianId!,
        type: NotificationType.DUE_DATE_APPROACHING,
        title: 'Échéance proche',
        summary: `L'ordre de travail ${wo.referenceNumber} arrive à échéance le ${dueDateFormatted}.`,
        entityType: 'WorkOrder',
        entityId: wo.id,
      });
      notified++;
    }

    this.logger.log(
      `DueDateApproachingJob: checked=${approachingWOs.length}, skipped=${approachingWOs.length - notified}, notified=${notified}`,
    );
  }
}
