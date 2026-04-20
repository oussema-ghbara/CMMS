import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, OnHoldReasonType } from '@gmao/db';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

// Avoid re-notifying within the same 23-hour window (job runs hourly).
const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class ContractorDateOverdueJob {
  private readonly logger = new Logger(ContractorDateOverdueJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const now = new Date();

    // Find ON_HOLD periods where the contractor expected resolution date has passed.
    const overdueHolds = await this.prisma.onHoldPeriod.findMany({
      where: {
        reasonType: OnHoldReasonType.EXTERNAL_CONTRACTOR,
        resumedAt: null,
        expectedResolutionDate: { not: null, lt: now },
      },
      select: {
        id: true,
        workOrderId: true,
        workOrder: { select: { referenceNumber: true } },
        expectedResolutionDate: true,
      },
    });

    if (overdueHolds.length === 0) {
      this.logger.debug('ContractorDateOverdueJob: no overdue contractor holds');
      return;
    }

    const dedupSince = new Date(now.getTime() - DEDUP_WINDOW_MS);
    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.CONTRACTOR_DATE_OVERDUE,
        entityType: 'WorkOrder',
        entityId: { in: overdueHolds.map((h) => h.workOrderId) },
        createdAt: { gte: dedupSince },
      },
      select: { entityId: true },
    });
    const alreadyNotifiedIds = new Set(alreadyNotified.map((n) => n.entityId));

    const toNotify = overdueHolds.filter((h) => !alreadyNotifiedIds.has(h.workOrderId));

    let notified = 0;
    for (const hold of toNotify) {
      await this.notifications.notifySupervisors(
        NotificationType.CONTRACTOR_DATE_OVERDUE,
        'Date prestataire dépassée',
        `L'ordre de travail ${hold.workOrder.referenceNumber} est toujours en attente d'un prestataire dont la date de résolution attendue est dépassée.`,
        'WorkOrder',
        hold.workOrderId,
      );
      notified++;
    }

    this.logger.log(
      `ContractorDateOverdueJob: checked=${overdueHolds.length}, skipped=${overdueHolds.length - notified}, notified=${notified}`,
    );
  }
}
