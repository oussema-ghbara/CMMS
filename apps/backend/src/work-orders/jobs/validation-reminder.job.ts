import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, WorkOrderStatus } from '@gmao/db';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JobLoggerService } from '../../job-logger/job-logger.service';

// Avoid re-notifying within the same 23-hour window (job runs hourly).
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

const JOB_NAME = 'validation-reminder';

@Injectable()
export class ValidationReminderJob {
  private readonly logger = new Logger(ValidationReminderJob.name);

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
    const pendingSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const pendingValidationWOs = await this.prisma.workOrder.findMany({
      where: {
        status: WorkOrderStatus.PENDING_VALIDATION,
        updatedAt: { lte: pendingSince },
      },
      select: {
        id: true,
        referenceNumber: true,
      },
    });

    if (pendingValidationWOs.length === 0) {
      this.logger.debug('ValidationReminderJob: no stale pending-validation WOs');
      return;
    }

    const dedupSince = new Date(now.getTime() - DEDUP_WINDOW_MS);
    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.VALIDATION_REMINDER_24H,
        entityType: 'WorkOrder',
        entityId: { in: pendingValidationWOs.map((wo) => wo.id) },
        createdAt: { gte: dedupSince },
      },
      select: { entityId: true },
    });
    const alreadyNotifiedIds = new Set(alreadyNotified.map((n) => n.entityId));

    const toNotify = pendingValidationWOs.filter((wo) => !alreadyNotifiedIds.has(wo.id));

    for (const wo of toNotify) {
      await this.notifications.notifySupervisors(
        NotificationType.VALIDATION_REMINDER_24H,
        'Validation en attente depuis plus de 24h',
        `L'ordre de travail ${wo.referenceNumber} est en attente de validation depuis plus de 24 heures.`,
        'WorkOrder',
        wo.id,
      );
    }

    this.logger.log(
      `ValidationReminderJob: checked=${pendingValidationWOs.length}, skipped=${pendingValidationWOs.length - toNotify.length}, notified=${toNotify.length}`,
    );
  }
}