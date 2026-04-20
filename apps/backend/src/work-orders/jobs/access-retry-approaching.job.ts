import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, OnHoldReasonType } from '@gmao/db';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

// Avoid re-notifying within the same 23-hour window (job runs hourly).
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class AccessRetryApproachingJob {
  private readonly logger = new Logger(AccessRetryApproachingJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find ACCESS_DENIED holds whose retry date is within the next 24 hours.
    const approachingHolds = await this.prisma.onHoldPeriod.findMany({
      where: {
        reasonType: OnHoldReasonType.ACCESS_DENIED,
        resumedAt: null,
        retryDate: { gte: now, lte: in24h },
      },
      select: {
        id: true,
        workOrderId: true,
        workOrder: { select: { referenceNumber: true } },
        retryDate: true,
      },
    });

    if (approachingHolds.length === 0) {
      this.logger.debug('AccessRetryApproachingJob: no access-denied holds with approaching retry date');
      return;
    }

    const dedupSince = new Date(now.getTime() - DEDUP_WINDOW_MS);
    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.ACCESS_RETRY_APPROACHING,
        entityType: 'WorkOrder',
        entityId: { in: approachingHolds.map((h) => h.workOrderId) },
        createdAt: { gte: dedupSince },
      },
      select: { entityId: true },
    });
    const alreadyNotifiedIds = new Set(alreadyNotified.map((n) => n.entityId));

    const toNotify = approachingHolds.filter((h) => !alreadyNotifiedIds.has(h.workOrderId));

    let notified = 0;
    for (const hold of toNotify) {
      const dateFormatted = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(hold.retryDate!);

      await this.notifications.notifySupervisors(
        NotificationType.ACCESS_RETRY_APPROACHING,
        "Date de nouvelle tentative d'accès approche",
        `L'ordre de travail ${hold.workOrder.referenceNumber} a une tentative d'accès planifiée pour le ${dateFormatted}.`,
        'WorkOrder',
        hold.workOrderId,
      );
      notified++;
    }

    this.logger.log(
      `AccessRetryApproachingJob: checked=${approachingHolds.length}, skipped=${approachingHolds.length - notified}, notified=${notified}`,
    );
  }
}
