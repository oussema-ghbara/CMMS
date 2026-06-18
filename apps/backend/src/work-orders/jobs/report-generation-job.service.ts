import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REPORT_GENERATION_QUEUE, REPORT_GENERATION_JOB_GENERATE } from './report-generation.constants';

export interface GeneratePdfReportJobData {
  workOrderId: string;
}

@Injectable()
export class ReportGenerationJobService {
  private readonly logger = new Logger(ReportGenerationJobService.name);

  constructor(
    @InjectQueue(REPORT_GENERATION_QUEUE)
    private readonly reportQueue: Queue<GeneratePdfReportJobData>,
  ) {}

  async enqueueReportGeneration(workOrderId: string): Promise<void> {
    await this.reportQueue.add(REPORT_GENERATION_JOB_GENERATE, { workOrderId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    this.logger.debug(`PDF report generation job enqueued for work order ${workOrderId}`);
  }
}
