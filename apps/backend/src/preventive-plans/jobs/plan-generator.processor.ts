import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PreventivePlansService } from '../preventive-plans.service';
import { PREVENTIVE_PLAN_QUEUE } from '../preventive-plans.constants';

@Processor(PREVENTIVE_PLAN_QUEUE)
export class PlanGeneratorProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanGeneratorProcessor.name);

  constructor(private readonly service: PreventivePlansService) {
    super();
  }

  async process(job: Job<{ planId: string }>): Promise<void> {
    const { planId } = job.data;
    this.logger.log(`Processing WO generation for plan ${planId} (job ${job.id})`);
    await this.service.generateWorkOrder(planId);
  }
}
