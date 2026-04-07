import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsRepository } from '../reports.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '@gmao/db';

@Injectable()
export class DeferredReportReminderJob {
  private readonly logger = new Logger(DeferredReportReminderJob.name);
  private readonly AGING_DAYS = 7;

  constructor(
    private readonly repo: ReportsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run() {
    this.logger.log('Running deferred report reminder job');
    const reports = await this.repo.findAgingDeferredReports(this.AGING_DAYS);
    for (const report of reports) {
      await this.notifications.notifySupervisors(
        NotificationType.DEFERRED_REPORT_REMINDER,
        'Deferred report aging reminder',
        `Report ${report.referenceNumber} has been deferred for over ${this.AGING_DAYS} days`,
        'ProblemReport',
        report.id,
      );
    }
    this.logger.log(`Sent reminders for ${reports.length} aging deferred reports`);
  }
}
