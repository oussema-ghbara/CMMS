import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PreventivePlansRepository } from '../preventive-plans.repository';
import { PREVENTIVE_PLAN_QUEUE, PLAN_GENERATOR_JOB } from '../preventive-plans.constants';

@Injectable()
export class PlanSchedulerService {
  private readonly logger = new Logger(PlanSchedulerService.name);

  constructor(
    private readonly repo: PreventivePlansRepository,
    @InjectQueue(PREVENTIVE_PLAN_QUEUE) private readonly queue: Queue<{ planId: string }>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduleDuePlans(): Promise<void> {
    const duePlans = await this.repo.findDuePlans();

    if (duePlans.length === 0) {
      this.logger.debug('No preventive plans due today');
      return;
    }

    this.logger.log(`Enqueueing WO generation for ${duePlans.length} due plan(s)`);

    await this.queue.addBulk(
      duePlans.map((plan) => ({
        name: PLAN_GENERATOR_JOB,
        data: { planId: plan.id },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential' as const, delay: 60_000 },
          removeOnComplete: 50,
          removeOnFail: 200,
          // Deduplicate — if somehow enqueued twice, same jobId prevents double-generation
          jobId: `plan-gen-${plan.id}-${new Date().toISOString().slice(0, 10)}`,
        },
      })),
    );
  }
}
