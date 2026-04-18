import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { AssignmentService } from './assignment.service';
import { InterventionService } from './intervention.service';
import { OnHoldService } from './on-hold.service';
import { ValidationService } from './validation.service';
import { ChecklistService } from './checklist.service';
import { ReportGenerationService } from './report-generation.service';
import { PriorityEscalationJob } from './jobs/priority-escalation.job';
import { DailySummaryJob } from './jobs/daily-summary.job';
import { DueDateApproachingJob } from './jobs/due-date-approaching.job';
import { ReportGenerationProcessor } from './jobs/report-generation.processor';
import { ReportGenerationJobService } from './jobs/report-generation-job.service';
import { REPORT_GENERATION_QUEUE } from './jobs/report-generation.constants';
import { AssetsModule } from '../assets/assets.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StorageModule } from '../storage/storage.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    AssetsModule,
    InventoryModule,
    StorageModule,
    MailModule,
    BullModule.registerQueue({ name: REPORT_GENERATION_QUEUE }),
  ],
  controllers: [WorkOrdersController],
  providers: [
    WorkOrdersService,
    WorkOrdersRepository,
    AssignmentService,
    InterventionService,
    OnHoldService,
    ValidationService,
    ChecklistService,
    ReportGenerationService,
    ReportGenerationJobService,
    ReportGenerationProcessor,
    PriorityEscalationJob,
    DailySummaryJob,
    DueDateApproachingJob,
  ],
  exports: [WorkOrdersService, ReportGenerationJobService],
})
export class WorkOrdersModule {}
