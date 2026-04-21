import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ScheduledJobStatus {
  jobName: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorMessage: string | null;
}

/** Maximum characters stored for an error message to prevent runaway DB writes. */
const MAX_ERROR_LENGTH = 500;

@Injectable()
export class JobLoggerService {
  private readonly logger = new Logger(JobLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    } catch (err) {
      this.logger.error(`Failed to record failure for job "${jobName}"`, err);
    }
  }

  async getAll(): Promise<ScheduledJobStatus[]> {
    return this.prisma.scheduledJobLog.findMany({ orderBy: { jobName: 'asc' } });
  }
}
