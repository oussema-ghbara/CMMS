import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { MAIL_QUEUE } from '../mail/mail.constants';
import { REPORT_GENERATION_QUEUE } from '../work-orders/jobs/report-generation.constants';
import { PREVENTIVE_PLAN_QUEUE } from '../preventive-plans/preventive-plans.constants';

@Module({
  imports: [
    PrismaModule,
    SystemConfigModule,
    BullModule.registerQueue(
      { name: MAIL_QUEUE },
      { name: REPORT_GENERATION_QUEUE },
      { name: PREVENTIVE_PLAN_QUEUE },
    ),
  ],
  controllers: [AdminController],
  providers: [AdminAnalyticsService],
})
export class AdminModule {}
