import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PreventivePlansRepository } from '../preventive-plans.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { PREVENTIVE_PLAN_QUEUE, PLAN_GENERATOR_JOB } from '../preventive-plans.constants';
import { NotificationType } from '@gmao/db';

@Injectable()
export class PlanSchedulerService {
  private readonly logger = new Logger(PlanSchedulerService.name);

  constructor(
    private readonly repo: PreventivePlansRepository,
    private readonly notifications: NotificationsService,
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

    const conflicts = await this.repo.findSameDayAssetConflicts(duePlans);
    if (conflicts.size > 0) {
      this.logger.warn(`Detected ${conflicts.size} asset(s) with multiple due plans today`);

      for (const [assetId, planDetails] of conflicts.entries()) {
        const planList = planDetails.map((p) => `"${p.planTitle}"`).join(', ');
        const assetName = planDetails[0]!.assetName;

        this.logger.log(`Plan conflict on asset "${assetName}": ${planList}`);

        await this.notifications.notifySupervisors(
          NotificationType.PREVENTIVE_PLAN_GENERATED,
          'Conflit détecté : plusieurs plans préventifs',
          `L'équipement "${assetName}" a ${planDetails.length} plans de maintenance préventive dus ` +
            `aujourd'hui: ${planList}. Deux ordres de travail seront créés.`,
          'Asset',
          assetId,
        );
      }
    }

    await this.queue.addBulk(
      duePlans.map((plan) => ({
        name: PLAN_GENERATOR_JOB,
        data: { planId: plan.id },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential' as const, delay: 60_000 },
          removeOnComplete: 50,
          removeOnFail: 200,
          jobId: `plan-gen-${plan.id}-${new Date().toISOString().slice(0, 10)}`,
        },
      })),
    );
  }
}
