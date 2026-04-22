import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobLoggerService } from '../job-logger/job-logger.service';
import { NotificationType } from '@gmao/db';

/** Match the dedup window of all other hourly cron jobs. */
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

const JOB_NAME = 'failed-notification-detector';

/**
 * Hourly job that scans for email delivery failures in the Notification table
 * and alerts all active admin users when any are found (§1.16 / §12.4 Admin).
 *
 * Dedup: a single NOTIFICATION_DELIVERY_FAILED notification is emitted at most
 * once every 23 hours to avoid spamming admins while issues persist.
 */
@Injectable()
export class FailedNotificationDetectorJob {
  private readonly logger = new Logger(FailedNotificationDetectorJob.name);

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
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS);

    const failedCount = await this.prisma.notification.count({
      where: { emailFailed: true, createdAt: { gte: dedupSince } },
    });

    if (failedCount === 0) {
      this.logger.debug('FailedNotificationDetectorJob: no email delivery failures in the last 23 hours');
      return;
    }

    const alreadySent = await this.prisma.notification.findFirst({
      where: {
        type: NotificationType.NOTIFICATION_DELIVERY_FAILED,
        entityType: 'system',
        entityId: 'email-delivery',
        createdAt: { gte: dedupSince },
      },
      select: { id: true },
    });

    if (alreadySent) {
      this.logger.debug('FailedNotificationDetectorJob: admins already notified within 23h window');
      return;
    }

    await this.notifications.notifyAdmins(
      NotificationType.NOTIFICATION_DELIVERY_FAILED,
      'Échecs de livraison de notifications',
      `${failedCount} notification(s) n'ont pas pu être envoyées par e-mail au cours des 23 dernières heures.`,
      'system',
      'email-delivery',
    );

    this.logger.log(
      `FailedNotificationDetectorJob: notified admins — ${failedCount} failed email delivery(ies) detected`,
    );
  }
}
