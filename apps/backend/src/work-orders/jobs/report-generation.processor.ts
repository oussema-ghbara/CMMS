import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { ReportGenerationService } from '../report-generation.service';
import {
  REPORT_GENERATION_QUEUE,
  REPORT_GENERATION_JOB_GENERATE,
} from './report-generation.constants';
import type { GeneratePdfReportJobData } from './report-generation-job.service';

@Processor(REPORT_GENERATION_QUEUE)
export class ReportGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reportGenerator: ReportGenerationService,
  ) {
    super();
  }

  async process(job: Job<GeneratePdfReportJobData>): Promise<void> {
    const { workOrderId } = job.data;
    const startTime = Date.now();

    try {

      const pdfBuffer = await this.reportGenerator.generateReport(workOrderId);
      const fileName = `work-order-${workOrderId}-${Date.now()}.pdf`;
      const storageKey = `reports/${fileName}`;

      await this.storage.upload('pdfs', storageKey, pdfBuffer, 'application/pdf');
      this.logger.debug(
        `PDF uploaded to storage: ${storageKey} (size: ${pdfBuffer.length} bytes)`,
      );

      await this.prisma.workOrder.update({
        where: { id: workOrderId },
        data: { reportPdfKey: storageKey },
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `PDF report generated and stored for work order ${workOrderId} (${duration}ms, job ${job.id})`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to generate PDF report for work order ${workOrderId}: ${errorMsg}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err; 
    }
  }
}
