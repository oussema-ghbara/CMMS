import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkOrdersService } from '../work-orders.service';

@Injectable()
export class PriorityEscalationJob {
  private readonly logger = new Logger(PriorityEscalationJob.name);

  constructor(private readonly workOrders: WorkOrdersService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const result = await this.workOrders.autoEscalateOverduePriorities();
    this.logger.log(
      `Automatic priority escalation run completed: checked=${result.checked}, escalated=${result.escalated}`,
    );
  }
}