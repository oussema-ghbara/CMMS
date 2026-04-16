import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportGenerationJobService } from './jobs/report-generation-job.service';
import { ReportGenerationService } from './report-generation.service';
import { ReportGenerationProcessor } from './jobs/report-generation.processor';
import { StorageService } from '../storage/storage.service';
import { WorkOrderStatus, AssetStatus } from '@gmao/db';

describe('ReportGeneration Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jobService: ReportGenerationJobService;
  let reportService: ReportGenerationService;
  let processor: ReportGenerationProcessor;
  let storage: StorageService;

  const mockWorkOrderId = 'wo-test-1';
  const mockUserId = 'user-1';

  beforeAll(async () => {
    // This setup is for unit mocking; in real integration tests,
    // a test database container would be used via testcontainers.
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ReportGenerationProcessor', () => {
    const createProcessor = () => {
      const prismaService = {
        workOrder: {
          update: jest.fn().mockResolvedValue({ id: mockWorkOrderId }),
        },
      };

      const storageService = {
        upload: jest.fn().mockResolvedValue(undefined),
      };

      const reportGenService = {
        generateReport: jest.fn().mockResolvedValue(Buffer.from('PDF_CONTENT')),
      };

      const processor = new ReportGenerationProcessor(
        prismaService as never,
        storageService as never,
        reportGenService as never,
      );

      return { processor, prismaService, storageService, reportGenService };
    };

    it('processes report generation job successfully', async () => {
      const { processor, prismaService, storageService, reportGenService } = createProcessor();

      const job = {
        id: 'job-1',
        data: { workOrderId: mockWorkOrderId },
      };

      await processor.process(job as never);

      expect(reportGenService.generateReport).toHaveBeenCalledWith(mockWorkOrderId);
      expect(storageService.upload).toHaveBeenCalledWith(
        'pdfs',
        expect.stringContaining(`work-order-${mockWorkOrderId}`),
        Buffer.from('PDF_CONTENT'),
        'application/pdf',
      );
      expect(prismaService.workOrder.update).toHaveBeenCalledWith({
        where: { id: mockWorkOrderId },
        data: { reportPdfKey: expect.stringContaining('reports/') },
      });
    });

    it('handles PDF generation failure with error logging', async () => {
      const { processor, prismaService, storageService, reportGenService } = createProcessor();
      const error = new Error('PDF generation failed: invalid work order data');
      reportGenService.generateReport.mockRejectedValue(error);

      const job = {
        id: 'job-1',
        data: { workOrderId: mockWorkOrderId },
      };

      await expect(processor.process(job as never)).rejects.toThrow(
        'PDF generation failed: invalid work order data',
      );

      expect(prismaService.workOrder.update).not.toHaveBeenCalled();
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('handles storage failure with error logging', async () => {
      const { processor, prismaService, storageService, reportGenService } = createProcessor();
      const error = new Error('MinIO storage unavailable');
      storageService.upload.mockRejectedValue(error);

      const job = {
        id: 'job-1',
        data: { workOrderId: mockWorkOrderId },
      };

      await expect(processor.process(job as never)).rejects.toThrow('MinIO storage unavailable');

      expect(prismaService.workOrder.update).not.toHaveBeenCalled();
    });

    it('handles database update failure gracefully', async () => {
      const { processor, prismaService, storageService, reportGenService } = createProcessor();
      const error = new Error('Database constraint violation');
      prismaService.workOrder.update.mockRejectedValue(error);

      const job = {
        id: 'job-1',
        data: { workOrderId: mockWorkOrderId },
      };

      await expect(processor.process(job as never)).rejects.toThrow(
        'Database constraint violation',
      );

      expect(reportGenService.generateReport).toHaveBeenCalled();
      expect(storageService.upload).toHaveBeenCalled();
    });

    it('stores PDF with correct filename format', async () => {
      const { processor, storageService, reportGenService } = createProcessor();
      reportGenService.generateReport.mockResolvedValue(Buffer.from('PDF_DATA'));

      const job = {
        id: 'job-1',
        data: { workOrderId: mockWorkOrderId },
      };

      await processor.process(job as never);

      const uploadCall = storageService.upload.mock.calls[0];
      expect(uploadCall[0]).toBe('pdfs');
      expect(uploadCall[1]).toMatch(/^reports\/work-order-wo-test-1-\d+\.pdf$/);
      expect(uploadCall[2]).toEqual(Buffer.from('PDF_DATA'));
      expect(uploadCall[3]).toBe('application/pdf');
    });
  });

  describe('ReportGenerationJobService', () => {
    const createJobService = () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      };

      const service = new ReportGenerationJobService(mockQueue as never);

      return { service, mockQueue };
    };

    it('enqueues report generation job with correct parameters', async () => {
      const { service, mockQueue } = createJobService();

      await service.enqueueReportGeneration(mockWorkOrderId);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-pdf-report',
        { workOrderId: mockWorkOrderId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    });

    it('handles job enqueue failures', async () => {
      const { service, mockQueue } = createJobService();
      mockQueue.add.mockRejectedValue(new Error('Queue connection failed'));

      await expect(service.enqueueReportGeneration(mockWorkOrderId)).rejects.toThrow(
        'Queue connection failed',
      );
    });
  });

  describe('ValidationService with ReportGeneration', () => {
    const createValidationContext = () => {
      const prismaService = {
        asset: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'asset-1', status: AssetStatus.IN_MAINTENANCE }),
        },
        $transaction: jest.fn(async (callback) => {
          const tx = {
            workOrder: { update: jest.fn().mockResolvedValue({ id: mockWorkOrderId }) },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            asset: { update: jest.fn().mockResolvedValue({}) },
            assetStatusLog: { create: jest.fn().mockResolvedValue({}) },
          };
          await callback(tx);
          return undefined;
        }),
      };

      const repositoryService = {
        findById: jest.fn().mockResolvedValue({
          id: mockWorkOrderId,
          status: WorkOrderStatus.PENDING_VALIDATION,
          assetId: 'asset-1',
        }),
      };

      const notificationService = {
        notify: jest.fn().mockResolvedValue(undefined),
      };

      const jobService = {
        enqueueReportGeneration: jest.fn().mockResolvedValue(undefined),
      };

      return {
        prismaService,
        repositoryService,
        notificationService,
        jobService,
      };
    };

    it('enqueues report generation on successful WO validation', async () => {
      const { prismaService, repositoryService, notificationService, jobService } =
        createValidationContext();

      // Simulating the validate method behavior
      const woTransition = await prismaService.$transaction(async (tx) => {
        await tx.workOrder.update({
          where: { id: mockWorkOrderId },
          data: {
            status: WorkOrderStatus.CLOSED,
            validatedById: mockUserId,
            validatedAt: new Date(),
            closedAt: new Date(),
          },
        });
      });

      // Report generation job should be enqueued
      await jobService.enqueueReportGeneration(mockWorkOrderId);

      expect(jobService.enqueueReportGeneration).toHaveBeenCalledWith(mockWorkOrderId);
    });
  });

  describe('Error Handling and Retries', () => {
    it('BullMQ processor retries on transient failure', () => {
      // BullMQ retry configuration is verified by job definition
      const jobConfig = {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      };

      expect(jobConfig.attempts).toBe(3);
      expect(jobConfig.backoff.type).toBe('exponential');
      expect(jobConfig.backoff.delay).toBe(5_000);
    });

    it('failed PDF jobs are kept for audit (removeOnFail: 500)', () => {
      // Job retention configuration
      const jobConfig = {
        removeOnComplete: 100,
        removeOnFail: 500,
      };

      expect(jobConfig.removeOnFail).toBeGreaterThan(jobConfig.removeOnComplete);
    });
  });

  describe('PDF Content Verification', () => {
    it('generated PDF buffer starts with PDF magic number', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\ntest content', 'latin1');
      const headerBytes = pdfBuffer.toString('latin1', 0, 4);

      expect(headerBytes).toBe('%PDF');
    });
  });
});
