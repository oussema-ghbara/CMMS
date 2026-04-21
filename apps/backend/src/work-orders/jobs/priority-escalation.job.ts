import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkOrdersService } from '../work-orders.service';
import { JobLoggerService } from '../../job-logger/job-logger.service';

const JOB_NAME = 'priority-escalation';

@Injectable()
export class PriorityEscalationJob {
  private readonly logger = new Logger(PriorityEscalationJob.name);

  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly jobLogger: JobLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    await this.jobLogger.recordStart(JOB_NAME);
    try {
      const result = await this.workOrders.autoEscalateOverduePriorities();
      this.logger.log(
        `Automatic priority escalation run completed: checked=${result.checked}, escalated=${result.escalated}`,
      );
      await this.jobLogger.recordSuccess(JOB_NAME);
    } catch (err) {
      await this.jobLogger.recordFailure(JOB_NAME, err as Error);
      throw err;
    }
  }
}