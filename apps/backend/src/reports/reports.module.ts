import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { DeferredReportReminderJob } from './jobs/deferred-report-reminder.job';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, DeferredReportReminderJob],
  exports: [ReportsService],
})
export class ReportsModule {}
