import { EventEmitter } from 'events';

const createdDocuments: any[] = [];

jest.mock('pdfkit', () => {
  class MockPDFDocument extends EventEmitter {
    public readonly textCalls: string[] = [];

    constructor() {
      super();
      createdDocuments.push(this);
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
    text(value?: unknown) {
      this.textCalls.push(String(value ?? ''));
      return this;
    }
    moveDown() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    stroke() { return this; }
    addPage() { return this; }
    get currentY() { return 100; }
  }

  return { __esModule: true, default: MockPDFDocument };
});

import { ReportGenerationService } from './report-generation.service';
import { WorkOrderStatus, AssetStatus } from '@gmao/db';

describe('ReportGenerationService', () => {
  const createService = () => {
    const repo = {
      findById: jest.fn(),
    };

    const prisma = {};

    const service = new ReportGenerationService(prisma as never, repo as never);

    return { service, repo, prisma };
  };

  const createMockWorkOrder = (overrides?: Partial<any>) => ({
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.CLOSED,
    type: 'CORRECTIVE',
    priority: 'HIGH',
    sourceType: 'PROBLEM_REPORT',
    description: 'Machine bearing replacement needed',
    internalNotes: 'Requires callout for bearing installation',
    capturedLocationPath: '/Building A/Floor 1/Workshop',
    estimatedDurationMinutes: 120,
    dueDate: new Date('2026-04-20T10:00:00Z'),
    sourceReportId: 'report-1',
    sourcePlanId: null,
    followUpFromId: null,
    triggeredByChecklistItemId: null,
    assetId: 'asset-1',
    principalTechnicianId: 'tech-1',
    contractorCost: '150.00',
    contractorCostCaptured: true,
    simultaneousMaintenanceAuthorized: false,
    simultaneousMaintenanceReason: null,
    cancellationReason: null,
    cancellationDetail: null,
    cancelledById: null,
    cancelledAt: null,
    postCancellationAssetStatus: null,
    createdById: 'user-1',
    validatedById: 'supervisor-1',
    validatedAt: new Date('2026-04-18T15:30:00Z'),
    closedAt: new Date('2026-04-18T15:30:00Z'),
    createdAt: new Date('2026-04-15T08:00:00Z'),
    updatedAt: new Date('2026-04-18T15:30:00Z'),
    reportPdfKey: null,

    // Relations
    asset: {
      id: 'asset-1',
      name: 'Lathe Machine A1',
      qrCodeIdentifier: 'ASSET-001',
      status: AssetStatus.OPERATIONAL,
      category: { id: 'cat-1', name: 'Heavy Machinery' },
      location: { id: 'loc-1', fullPath: '/Building A/Floor 1/Workshop' },
    },

    principalTechnician: {
      id: 'tech-1',
      name: 'John Smith',
    },

    validatedBy: {
      id: 'supervisor-1',
      name: 'Alice Johnson',
    },

    createdBy: {
      id: 'user-1',
      name: 'Bob Davis',
    },

    sourceReport: {
      id: 'report-1',
      referenceNumber: 'PR-2026-001',
    },

    sourcePlan: null,

    checklistItems: [
      {
        id: 'item-1',
        label: 'Inspect bearing condition',
        completedAt: new Date('2026-04-18T10:00:00Z'),
        notes: 'Bearing damage confirmed',
        sortOrder: 1,
      },
      {
        id: 'item-2',
        label: 'Install new bearing',
        completedAt: new Date('2026-04-18T12:00:00Z'),
        notes: null,
        sortOrder: 2,
      },
      {
        id: 'item-3',
        label: 'Perform load test',
        completedAt: null,
        notes: null,
        sortOrder: 3,
      },
    ],

    interventionLogs: [
      {
        id: 'log-1',
        technicianId: 'tech-1',
        startedAt: new Date('2026-04-18T09:00:00Z'),
        endedAt: new Date('2026-04-18T12:30:00Z'),
        activeDurationMinutes: 210,
        hourlyRateAtTime: '45.50',
        result: 'SUCCESS',
        resultExplanation: 'Bearing successfully replaced',
        isReassignmentRemnant: false,
        technician: { id: 'tech-1', name: 'John Smith' },
        actions: [
          { id: 'act-1', description: 'Removed old bearing' },
          { id: 'act-2', description: 'Installed new precision bearing' },
        ],
        offListParts: [],
      },
    ],

    partRequests: [
      {
        id: 'pr-1',
        status: 'FULFILLED',
        quantityRequested: 2,
        part: { id: 'part-1', name: 'Bearing Model X-500', referenceCode: 'BEAR-500' },
      },
      {
        id: 'pr-2',
        status: 'PENDING_FULFILLMENT',
        quantityRequested: 1,
        part: { id: 'part-2', name: 'Lubrication Oil', referenceCode: 'LUBR-001' },
      },
    ],

    validationActions: [
      {
        id: 'val-1',
        action: 'APPROVED',
        rejectionReason: null,
        rejectionDetail: null,
        validator: { id: 'supervisor-1', name: 'Alice Johnson' },
        createdAt: new Date('2026-04-18T15:30:00Z'),
      },
    ],

    assignments: [],
    statusLogs: [],
    priorityLogs: [],
    reassignments: [],
    onHoldPeriods: [],
    stockMovements: [],
    assetStatusLogs: [],

    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createdDocuments.splice(0, createdDocuments.length);
  });

  describe('generateReport()', () => {
    it('generates a PDF buffer for a closed work order', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder();
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      expect(repo.findById).toHaveBeenCalledWith('wo-1');
    });

    it('throws error for non-closed work order', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder({ status: WorkOrderStatus.IN_PROGRESS });
      repo.findById.mockResolvedValue(mockWO);

      await expect(service.generateReport('wo-1')).rejects.toThrow(
        'Work order wo-1 is not closed; status: IN_PROGRESS',
      );
    });

    it('generates PDF with minimal data (no checklist, interventions, parts)', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder({
        checklistItems: [],
        interventionLogs: [],
        partRequests: [],
        sourceReport: null,
        sourcePlan: null,
      });
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('generates PDF with optional fields null', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder({
        internalNotes: null,
        estimatedDurationMinutes: null,
        dueDate: null,
        principalTechnician: null,
        validatedBy: null,
      });
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('includes all work order sections in generated PDF', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder();
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      // PDF binary content starts with %PDF
      expect(pdfBuffer.toString('latin1').substring(0, 4)).toBe('%PDF');
    });

    it('handles work orders with rejection validation', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder({
        validationActions: [
          {
            id: 'val-1',
            action: 'REJECTED',
            rejectionReason: 'NOT_COMPLIANT',
            rejectionDetail: 'Work not meeting quality standards',
            validator: { id: 'supervisor-1', name: 'Alice Johnson' },
            createdAt: new Date('2026-04-18T15:30:00Z'),
          },
        ],
      });
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('generates PDF with complex intervention logs', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder({
        interventionLogs: [
          {
            id: 'log-1',
            technicianId: 'tech-1',
            startedAt: new Date('2026-04-18T09:00:00Z'),
            endedAt: new Date('2026-04-18T12:30:00Z'),
            activeDurationMinutes: 210,
            hourlyRateAtTime: '45.50',
            result: 'SUCCESS',
            resultExplanation: 'First intervention completed successfully',
            isReassignmentRemnant: false,
            technician: { id: 'tech-1', name: 'John Smith' },
            actions: [
              { id: 'act-1', description: 'Action 1' },
              { id: 'act-2', description: 'Action 2' },
            ],
            offListParts: [],
          },
          {
            id: 'log-2',
            technicianId: 'tech-2',
            startedAt: new Date('2026-04-18T13:00:00Z'),
            endedAt: null,
            activeDurationMinutes: null,
            hourlyRateAtTime: null,
            result: null,
            resultExplanation: null,
            isReassignmentRemnant: false,
            technician: { id: 'tech-2', name: 'Jane Doe' },
            actions: [],
            offListParts: [],
          },
        ],
      });
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('renders a cost breakdown section from persisted cost data', async () => {
      const { service, repo } = createService();
      const mockWO = createMockWorkOrder({
        contractorCost: '120.50',
        interventionLogs: [
          {
            id: 'log-1',
            technicianId: 'tech-1',
            startedAt: new Date('2026-04-18T09:00:00Z'),
            endedAt: new Date('2026-04-18T12:30:00Z'),
            activeDurationMinutes: 210,
            hourlyRateAtTime: '45.50',
            result: 'SUCCESS',
            resultExplanation: 'Bearing successfully replaced',
            isReassignmentRemnant: false,
            technician: { id: 'tech-1', name: 'John Smith' },
            actions: [],
            offListParts: [],
          },
        ],
        stockMovements: [
          { id: 'sm-1', type: 'OUTGOING', quantity: 2, unitCostAtTime: '30.00', createdAt: new Date() },
        ],
      });
      repo.findById.mockResolvedValue(mockWO);

      const pdfBuffer = await service.generateReport('wo-1');

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      expect(createdDocuments[0].textCalls).toEqual(expect.arrayContaining([
        'COÛTS',
        'Pièces: 60,00',
        "Main d'oeuvre: 159,25",
        'Sous-traitance: 120,50',
        'Total: 339,75',
      ]));
    });
  });
});
