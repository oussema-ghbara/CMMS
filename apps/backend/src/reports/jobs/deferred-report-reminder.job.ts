import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsRepository } from '../reports.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '@gmao/db';

/**
 * Three-tier aging system for deferred problem reports.
 *
 * The job runs once a day at 08:00.  Each tier fires for reports whose
 * `deferredAt` crossed its threshold in the preceding 24-hour window, so
 * every report receives exactly one notification per tier, never repeated.
 *
 *  Tier     | Threshold | Window queried              | Audience
 *  ---------|-----------|-----------------------------|-----------
 *  REMINDER | 48 h      | deferredAt ∈ [now-72h, now-48h) | supervisors
 *  FOLLOW_UP| 7 d       | deferredAt ∈ [now-8d,  now-7d)  | supervisors
 *  ESCALATION| 14 d     | deferredAt ∈ [now-15d, now-14d) | supervisors
 */
@Injectable()
export class DeferredReportReminderJob {
  private readonly logger = new Logger(DeferredReportReminderJob.name);

  // Tier definitions: { label, minHours, maxHours, type, buildTitle, buildSummary }
  private readonly TIERS = [
    {
      label: '48h',
      minHours: 48,
      maxHours: 72,
      type: NotificationType.DEFERRED_REPORT_REMINDER,
      buildTitle: (ref: string) =>
        `Signalement différé depuis 48 h — ${ref}`,
      buildSummary: (ref: string) =>
        `Le signalement ${ref} est différé depuis plus de 48 heures. Un traitement est recommandé.`,
    },
    {
      label: '7 days',
      minHours: 168,   // 7 × 24
      maxHours: 192,   // 8 × 24
      type: NotificationType.DEFERRED_REPORT_REMINDER,
      buildTitle: (ref: string) =>
        `Signalement différé depuis 7 jours — ${ref}`,
      buildSummary: (ref: string) =>
        `Le signalement ${ref} est différé depuis plus de 7 jours. Une action est requise.`,
    },
    {
      label: '14 days',
      minHours: 336,   // 14 × 24
      maxHours: 360,   // 15 × 24
      type: NotificationType.DEFERRED_REPORT_REMINDER,
      buildTitle: (ref: string) =>
        `⚠ Signalement différé depuis 14 jours — ${ref}`,
      buildSummary: (ref: string) =>
        `Le signalement ${ref} est différé depuis plus de 14 jours. Une escalade est nécessaire.`,
    },
  ] as const;

  constructor(
    private readonly repo: ReportsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run(): Promise<void> {
    this.logger.log('Running deferred-report aging job');

    let totalNotified = 0;

    for (const tier of this.TIERS) {
      const reports = await this.repo.findReportsDeferredInWindow(
        tier.minHours,
        tier.maxHours,
      );

      for (const report of reports) {
        await this.notifications.notifySupervisors(
          tier.type,
          tier.buildTitle(report.referenceNumber),
          tier.buildSummary(report.referenceNumber),
          'ProblemReport',
          report.id,
        );
        totalNotified++;
      }

      this.logger.log(
        `[${tier.label}] notified for ${reports.length} report(s)`,
      );
    }

    this.logger.log(`Deferred-report aging job done — ${totalNotified} notification(s) dispatched`);
  }
}
