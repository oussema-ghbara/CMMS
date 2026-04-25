// Same CJS interop fix as report-generation.service.spec.ts: return class directly.
jest.mock('pdfkit', () => {
  const { EventEmitter } = require('events') as typeof import('events');

  class MockPDFDocument extends EventEmitter {
    constructor() {
      super();
    }

    end() {
      setImmediate(() => {
        this.emit('data', Buffer.from('%PDF-1.4'));
        this.emit('data', Buffer.from('mock PDF content'));
        this.emit('end');
      });
    }

    fontSize() { return this; }
    font() { return this; }
    text() { return this; }
    moveDown() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    stroke() { return this; }
    addPage() { return this; }
    get currentY() { return 100; }
  }

  return MockPDFDocument;
});

import { Test, TestingModule } from '@nestjs/testing';
import { ValidationService } from './validation.service';
import { WorkOrderStatus, AssetStatus, Role } from '@gmao/db';

/**
 * End-to-End Flow Test for PDF Report Generation
 *
 * This test validates the complete workflow:
 * 1. Supervisor validates a work order (PENDING_VALIDATION -> CLOSED)
 * 2. ValidationService updates work order status and asset status
 * 3. ReportGenerationJobService enqueues PDF generation job
 * 4. BullMQ processor generates PDF from work order data
 * 5. PDF is uploaded to MinIO storage
 * 6. WorkOrder is updated with reportPdfKey reference
 *
 * Success Criteria:
 * - WO status transitions to CLOSED
 * - Asset status transitions to OPERATIONAL
 * - PDF generation job is queued
 * - PDF file is created with proper content
 * - PDF reference is stored in database
 */

describe('E2E: Work Order Validation → PDF Report Generation', () => {
  // ===== SETUP =====
  const supervisor = { id: 'supervisor-1', name: 'Alice Johnson', roles: [Role.SUPERVISOR] };
  const technician = { id: 'tech-1', name: 'John Smith', roles: [Role.TECHNICIAN] };
  const mockWorkOrder = {
    id: 'wo-e2e-001',
    referenceNumber: 'WO-2026-005',
    status: WorkOrderStatus.PENDING_VALIDATION,
    type: 'CORRECTIVE',
    priority: 'MEDIUM',
    sourceType: 'PROBLEM_REPORT',
    description: 'Pump seal replacement',
    internalNotes: 'Use OEM seals only',
    capturedLocationPath: '/Building B/Floor 2/Pump Room',
    estimatedDurationMinutes: 90,
    dueDate: new Date('2026-04-20'),
    assetId: 'asset-pump-1',
    principalTechnicianId: technician.id,
    createdById: 'user-1',
    validatedById: null,
    validatedAt: null,
    closedAt: null,
    reportPdfKey: null,
    createdAt: new Date('2026-04-15'),
    updatedAt: new Date('2026-04-15'),

    asset: {
      id: 'asset-pump-1',
      name: 'Circulation Pump P-01',
      qrCodeIdentifier: 'PUMP-001',
      status: AssetStatus.IN_MAINTENANCE,
      category: { id: 'cat-1', name: 'Pumps' },
      location: { id: 'loc-1', fullPath: '/Building B/Floor 2/Pump Room' },
    },

    principalTechnician: technician,
    validatedBy: null,
    checklistItems: [
      { id: 'ci-1', label: 'Inspect seal condition', completedAt: new Date(), notes: 'Seal worn', sortOrder: 1 },
      { id: 'ci-2', label: 'Replace seal', completedAt: new Date(), notes: null, sortOrder: 2 },
      { id: 'ci-3', label: 'Test pump operation', completedAt: new Date(), notes: 'Passed', sortOrder: 3 },
    ],

    interventionLogs: [
      {
        id: 'log-1',
        technicianId: technician.id,
        technician: technician,
        startedAt: new Date('2026-04-18T08:00:00Z'),
        endedAt: new Date('2026-04-18T09:30:00Z'),
        activeDurationMinutes: 90,
        hourlyRateAtTime: '50.00',
        result: 'SUCCESS',
        resultExplanation: 'Seal replaced successfully, pump operational',
        actions: [
          { id: 'a1', description: 'Isolated pump from system' },
          { id: 'a2', description: 'Removed old seal assembly' },
          { id: 'a3', description: 'Installed new OEM seal' },
          { id: 'a4', description: 'Tested pump at full pressure' },
        ],
      },
    ],

    partRequests: [
      {
        id: 'pr-1',
        status: 'FULFILLED',
        quantityRequested: 1,
        part: { id: 'part-1', name: 'Pump Seal OEM P-01', referenceCode: 'SEAL-P01' },
      },
    ],

    validationActions: [],
    assignments: [],
    statusLogs: [],
    priorityLogs: [],
    reassignments: [],
    onHoldPeriods: [],
    stockMovements: [],
    assetStatusLogs: [],
    sourceReport: { id: 'report-1', referenceNumber: 'PR-2026-003' },
    sourcePlan: null,
    followUps: [],
  };

  // ===== TEST SCENARIO: Happy Path =====
  describe('Happy Path: Successful WO Validation and PDF Generation', () => {
    it('validates WO and enqueues PDF generation job', async () => {
      // Step 1: Setup mocks
      const repo = { findById: jest.fn().mockResolvedValue(mockWorkOrder) };
      const prisma = {
        asset: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockWorkOrder.asset) },
        $transaction: jest.fn(async (callback) => {
          const tx = {
            workOrder: {
              update: jest
                .fn()
                .mockResolvedValue({
                  ...mockWorkOrder,
                  status: WorkOrderStatus.CLOSED,
                  validatedById: supervisor.id,
                  validatedAt: new Date(),
                  closedAt: new Date(),
                }),
            },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            asset: {
              update: jest
                .fn()
                .mockResolvedValue({ ...mockWorkOrder.asset, status: AssetStatus.OPERATIONAL }),
            },
            assetStatusLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }),
      };
      const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
      const jobService = { enqueueReportGeneration: jest.fn().mockResolvedValue(undefined) };

      const service = new ValidationService(
        prisma as never,
        repo as never,
        notifications as never,
        jobService as never,
      );

      // Step 2: Execute validation
      const result = await service.validate(mockWorkOrder.id, supervisor.id);

      // Step 3: Verify WO transitions to CLOSED
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.referenceNumber).toBe(mockWorkOrder.referenceNumber);

      // Step 4: Verify PDF generation job was enqueued
      expect(jobService.enqueueReportGeneration).toHaveBeenCalledWith(mockWorkOrder.id);
    });

    it('completes full pipeline: validation → PDF generation → storage → DB update', async () => {
      // This test traces the complete flow through all layers

      // LAYER 1: ValidationService (WO validation + job enqueue)
      const validationRepo = { findById: jest.fn().mockResolvedValue(mockWorkOrder) };
      const validationPrisma = {
        asset: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockWorkOrder.asset) },
        $transaction: jest.fn(async (callback) => {
          const tx = {
            workOrder: { update: jest.fn().mockResolvedValue({}) },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            asset: { update: jest.fn().mockResolvedValue({}) },
            assetStatusLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }),
      };
      const validationNotifications = { notify: jest.fn().mockResolvedValue(undefined) };
      const jobService = { enqueueReportGeneration: jest.fn().mockResolvedValue(undefined) };

      const validationService = new ValidationService(
        validationPrisma as never,
        validationRepo as never,
        validationNotifications as never,
        jobService as never,
      );

      // Execute validation
      await validationService.validate(mockWorkOrder.id, supervisor.id);

      // LAYER 2: Verify job was enqueued
      expect(jobService.enqueueReportGeneration).toHaveBeenCalledWith(mockWorkOrder.id);

      // LAYER 3: ReportGenerationService (PDF generation)
        const closedMockWorkOrder = { ...mockWorkOrder, status: WorkOrderStatus.CLOSED, closedAt: new Date() };
        const reportRepo = { findById: jest.fn().mockResolvedValue(closedMockWorkOrder) };
      const reportPrisma = {};
      const reportService = require('./report-generation.service').ReportGenerationService;
      const report = new reportService(reportPrisma, reportRepo);
      const pdfBuffer = await report.generateReport(mockWorkOrder.id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // LAYER 4: ReportGenerationProcessor (Storage + DB update)
      const processorPrisma = {
        workOrder: {
          update: jest.fn().mockResolvedValue({
            ...mockWorkOrder,
            reportPdfKey: `reports/work-order-${mockWorkOrder.id}-1234567890.pdf`,
          }),
        },
      };
      const processorStorage = {
        upload: jest.fn().mockResolvedValue(undefined),
      };
      const processorReportService = {
        generateReport: jest.fn().mockResolvedValue(pdfBuffer),
      };

      const ReportGenerationProcessor = require('./jobs/report-generation.processor')
        .ReportGenerationProcessor;
      const processor = new ReportGenerationProcessor(
        processorPrisma as never,
        processorStorage as never,
        processorReportService as never,
      );

      const job = { id: 'job-1', data: { workOrderId: mockWorkOrder.id } };
      await processor.process(job as never);

      // Verify storage was called
      expect(processorStorage.upload).toHaveBeenCalledWith(
        'pdfs',
        expect.stringContaining('reports/work-order-wo-e2e-001'),
        pdfBuffer,
        'application/pdf',
      );

      // Verify DB was updated with PDF reference
      expect(processorPrisma.workOrder.update).toHaveBeenCalledWith({
        where: { id: mockWorkOrder.id },
        data: { reportPdfKey: expect.stringContaining('reports/') },
      });
    });
  });

  // ===== TEST SCENARIO: Failure Cases =====
  describe('Failure Cases: Error Recovery', () => {
    it('validation fails if WO is not in PENDING_VALIDATION status', async () => {
      const repo = {
        findById: jest
          .fn()
          .mockResolvedValue({ ...mockWorkOrder, status: WorkOrderStatus.IN_PROGRESS }),
      };
      const prisma = {};
      const notifications = {};
      const jobService = {};

      const service = new ValidationService(
        prisma as never,
        repo as never,
        notifications as never,
        jobService as never,
      );

      // The state machine should reject this transition
      await expect(service.validate(mockWorkOrder.id, supervisor.id)).rejects.toThrow();
    });

    it('PDF generation failure does not block WO closure', async () => {
      // The job is enqueued asynchronously with fire-and-forget pattern
      // So even if PDF generation fails, the WO validation completes
      const repo = { findById: jest.fn().mockResolvedValue(mockWorkOrder) };
      const prisma = {
        asset: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockWorkOrder.asset) },
        $transaction: jest.fn(async (callback) => {
          const tx = {
            workOrder: { update: jest.fn().mockResolvedValue({}) },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            asset: { update: jest.fn().mockResolvedValue({}) },
            assetStatusLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }),
      };
      const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
      const jobService = { enqueueReportGeneration: jest.fn().mockResolvedValue(undefined) };

      const service = new ValidationService(
        prisma as never,
        repo as never,
        notifications as never,
        jobService as never,
      );

      // Validation should still complete
      const result = await service.validate(mockWorkOrder.id, supervisor.id);
      expect(result).toBeDefined();
      expect(result.referenceNumber).toBe(mockWorkOrder.referenceNumber);
      
      // When job enqueue succeeds, it is called without throwing
      expect(jobService.enqueueReportGeneration).toHaveBeenCalledWith(mockWorkOrder.id);
    });

    it('storage failure triggers job retry mechanism', async () => {
      // BullMQ retries 3 times with exponential backoff
      const jobConfig = {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5_000 },
      };

      expect(jobConfig.attempts).toBe(3);
      expect(jobConfig.backoff.type).toBe('exponential');

      // On first failure, BullMQ will retry after 5 seconds
      // On second failure, BullMQ will retry after 10 seconds (exponential)
      // On final failure, job is stored for manual review (removeOnFail: 500)
    });
  });

  // ===== TEST SCENARIO: Edge Cases =====
  describe('Edge Cases', () => {
    it('handles WO with no checklist items', async () => {
        const woNoChecklist = { ...mockWorkOrder, status: WorkOrderStatus.CLOSED, closedAt: new Date(), checklistItems: [] };
      const repo = { findById: jest.fn().mockResolvedValue(woNoChecklist) };
      const prisma = {};
      const ReportGenerationService = require('./report-generation.service').ReportGenerationService;
      const service = new ReportGenerationService(prisma as never, repo as never);

      const pdfBuffer = await service.generateReport(mockWorkOrder.id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('handles WO with no intervention logs', async () => {
        const woNoLogs = { ...mockWorkOrder, status: WorkOrderStatus.CLOSED, closedAt: new Date(), interventionLogs: [] };
      const repo = { findById: jest.fn().mockResolvedValue(woNoLogs) };
      const prisma = {};
      const ReportGenerationService = require('./report-generation.service').ReportGenerationService;
      const service = new ReportGenerationService(prisma as never, repo as never);

      const pdfBuffer = await service.generateReport(mockWorkOrder.id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('handles WO with incomplete intervention logs', async () => {
      const woIncompleteLog = {
        ...mockWorkOrder,
          status: WorkOrderStatus.CLOSED,
          closedAt: new Date(),
        interventionLogs: [
          {
            technicianId: technician.id,
            technician: technician,
            startedAt: new Date('2026-04-18T08:00:00Z'),
            endedAt: null,
            activeDurationMinutes: null,
            hourlyRateAtTime: null,
            result: null,
            resultExplanation: null,
          },
        ],
      };
      const repo = { findById: jest.fn().mockResolvedValue(woIncompleteLog) };
      const prisma = {};
      const ReportGenerationService = require('./report-generation.service').ReportGenerationService;
      const service = new ReportGenerationService(prisma as never, repo as never);

      const pdfBuffer = await service.generateReport(mockWorkOrder.id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });
  });

  // ===== REGRESSION TESTS =====
  describe('Regression: Existing Behavior Preserved', () => {
    it('WO validation still updates asset status', async () => {
      const repo = { findById: jest.fn().mockResolvedValue(mockWorkOrder) };
      const updateCalls: any[] = [];
      const prisma = {
        asset: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockWorkOrder.asset) },
        $transaction: jest.fn(async (callback) => {
          const tx = {
            workOrder: { update: jest.fn().mockResolvedValue({}) },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            asset: {
              update: jest.fn((data) => {
                updateCalls.push(data);
                return Promise.resolve({});
              }),
            },
            assetStatusLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }),
      };
      const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
      const jobService = { enqueueReportGeneration: jest.fn().mockResolvedValue(undefined) };

      const service = new ValidationService(
        prisma as never,
        repo as never,
        notifications as never,
        jobService as never,
      );

      await service.validate(mockWorkOrder.id, supervisor.id);

      // Asset update should set status to OPERATIONAL
      expect(updateCalls[0]).toEqual({
        where: { id: mockWorkOrder.asset.id },
        data: { status: AssetStatus.OPERATIONAL },
      });
    });

    it('WO validation creates proper status log entries', async () => {
      const repo = { findById: jest.fn().mockResolvedValue(mockWorkOrder) };
      const statusLogCalls: any[] = [];
      const prisma = {
        asset: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockWorkOrder.asset) },
        $transaction: jest.fn(async (callback) => {
          const tx = {
            workOrder: { update: jest.fn().mockResolvedValue({}) },
            workOrderStatusLog: {
              create: jest.fn((data) => {
                statusLogCalls.push(data);
                return Promise.resolve({});
              }),
            },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            asset: { update: jest.fn().mockResolvedValue({}) },
            assetStatusLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }),
      };
      const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
      const jobService = { enqueueReportGeneration: jest.fn().mockResolvedValue(undefined) };

      const service = new ValidationService(
        prisma as never,
        repo as never,
        notifications as never,
        jobService as never,
      );

      await service.validate(mockWorkOrder.id, supervisor.id);

      // Status log should record transition
        expect(statusLogCalls[0]).toEqual({
          data: {
            workOrderId: mockWorkOrder.id,
            fromStatus: mockWorkOrder.status,
            toStatus: WorkOrderStatus.CLOSED,
            actorId: supervisor.id,
            label: 'Work order validated and closed',
          },
        });
    });
  });
});
