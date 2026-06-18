import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@gmao/db';

export interface ScheduledJobStatus {
  jobName: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorMessage: string | null;
}

const MAX_ERROR_LENGTH = 500;

const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class JobLoggerService {
  private readonly logger = new Logger(JobLoggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications: NotificationsService | null = null,
  ) {}

  async recordStart(jobName: string): Promise<void> {
    try {
      await this.prisma.scheduledJobLog.upsert({
        where: { jobName },
        create: { jobName, lastRunAt: new Date() },
        update: { lastRunAt: new Date() },
      });
    } catch (err) {
      this.logger.error(`Failed to record start for job "${jobName}"`, err);
    }
  }

  async recordSuccess(jobName: string): Promise<void> {
    try {
      await this.prisma.scheduledJobLog.upsert({
        where: { jobName },
        create: { jobName, lastRunAt: new Date(), lastSuccessAt: new Date() },
        update: { lastSuccessAt: new Date() },
      });
    } catch (err) {
      this.logger.error(`Failed to record success for job "${jobName}"`, err);
    }
  }

  async recordFailure(jobName: string, error: Error): Promise<void> {
    try {
      const message = error.message.substring(0, MAX_ERROR_LENGTH);
      await this.prisma.scheduledJobLog.upsert({
        where: { jobName },
        create: {
          jobName,
          lastRunAt: new Date(),
          lastFailureAt: new Date(),
          lastErrorMessage: message,
        },
        update: { lastFailureAt: new Date(), lastErrorMessage: message },
      });
      await this.notifyAdminsJobFailed(jobName, message);
    } catch (err) {
      this.logger.error(`Failed to record failure for job "${jobName}"`, err);
    }
  }

  async getAll(): Promise<ScheduledJobStatus[]> {
    return this.prisma.scheduledJobLog.findMany({ orderBy: { jobName: 'asc' } });
  }

  private async notifyAdminsJobFailed(jobName: string, errorMessage: string): Promise<void> {
    if (!this.notifications) return;

    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS);
    const alreadySent = await this.prisma.notification.findFirst({
      where: {
        type: NotificationType.SCHEDULED_JOB_FAILED,
        entityType: 'ScheduledJob',
        entityId: jobName,
        createdAt: { gte: dedupSince },
      },
      select: { id: true },
    });

    if (alreadySent) {
      this.logger.debug(`JobLoggerService: SCHEDULED_JOB_FAILED already sent for "${jobName}" within 23h window`);
      return;
    }

    await this.notifications.notifyAdmins(
      NotificationType.SCHEDULED_JOB_FAILED,
      'Échec de tâche planifiée',
      `La tâche planifiée « ${jobName} » a échoué : ${errorMessage}`,
      'ScheduledJob',
      jobName,
    );
  }
}
