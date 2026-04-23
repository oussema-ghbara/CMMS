import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PreventivePlansController } from './preventive-plans.controller';
import { PreventivePlansService } from './preventive-plans.service';
import { PreventivePlansRepository } from './preventive-plans.repository';
import { PlanGeneratorProcessor } from './jobs/plan-generator.processor';
import { PlanSchedulerService } from './jobs/plan-scheduler.service';
import { PREVENTIVE_PLAN_QUEUE } from './preventive-plans.constants';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [
    // BullModule.forRootAsync is already registered globally in MailModule.
    // registerQueue here connects to that existing Redis connection.
    BullModule.registerQueue({ name: PREVENTIVE_PLAN_QUEUE }),
    AssetsModule,
  ],
  controllers: [PreventivePlansController],
  providers: [
    PreventivePlansService,
    PreventivePlansRepository,
    PlanGeneratorProcessor,
    PlanSchedulerService,
  ],
  exports: [PreventivePlansService],
})
export class PreventivePlansModule {}
