import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrderStatus } from '@gmao/db';
import { WorkOrderPriority, WorkOrderType } from '@gmao/shared';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartRequestsService } from '../inventory/part-requests.service';
import { StorageService } from '../storage/storage.service';
import { ReportGenerationService } from './report-generation.service';

describe('WorkOrdersService.findById validation insights', () => {
  let service: WorkOrdersService;
  let repo: jest.Mocked<WorkOrdersRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: WorkOrdersRepository,
          useValue: {
            findById: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
            updatePriority: jest.fn(),
            findOverdueForEscalation: jest.fn(),
            findOverdueCritical: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: NotificationsService,
          useValue: {
            notify: jest.fn(),
            notifyMany: jest.fn(),
            notifySupervisors: jest.fn(),
          },
        },
        {
          provide: PartRequestsService,
          useValue: {
            handleWorkOrderCancellation: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            upload: jest.fn(),
            getPresignedUrl: jest.fn(),
          },
        },
        {
          provide: ReportGenerationService,
          useValue: {
            generateReport: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WorkOrdersService);
    repo = module.get(WorkOrdersRepository) as jest.Mocked<WorkOrdersRepository>;
  });

  function buildDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: 'wo-1',
      referenceNumber: 'WO-2026-100',
      status: WorkOrderStatus.PENDING_VALIDATION,
      type: WorkOrderType.CORRECTIVE,
      priority: WorkOrderPriority.HIGH,
      description: 'Inspect pump',
      estimatedDurationMinutes: 120,
      assignments: [
        {
          technicianId: 'tech-principal',
          isPrincipal: true,
          isActive: true,
          technician: { name: 'Principal Tech' },
        },
        {
          technicianId: 'tech-contributor-a',
          isPrincipal: false,
          isActive: true,
          technician: { name: 'Contributor A' },
        },
        {
          technicianId: 'tech-contributor-b',
          isPrincipal: false,
          isActive: true,
          technician: { name: 'Contributor B' },
        },
      ],
      interventionLogs: [
        { technicianId: 'tech-principal', activeDurationMinutes: 60 },
        { technicianId: 'tech-contributor-a', activeDurationMinutes: 90 },
      ],
      ...overrides,
    } as any;
  }

  it('flags active contributors without logs and computes time deviation', async () => {
    repo.findById.mockResolvedValue(buildDetail());

    const result = await service.findById('wo-1');

    expect(repo.findById).toHaveBeenCalledWith('wo-1');
    expect(result.contributorsWithoutLog).toEqual([
      { technicianId: 'tech-contributor-b', name: 'Contributor B' },
    ]);
    expect(result.timeDeviation).toEqual({
      estimatedDurationMinutes: 120,
      actualDurationMinutes: 150,
      deltaMinutes: 30,
      deltaPercent: 25,
    });
    expect(result.hasNotableTimeDeviation).toBe(true);
  });

  it('does not flag contributors when each active contributor has at least one log', async () => {
    repo.findById.mockResolvedValue(
      buildDetail({
        interventionLogs: [
          { technicianId: 'tech-principal', activeDurationMinutes: 60 },
          { technicianId: 'tech-contributor-a', activeDurationMinutes: 40 },
          { technicianId: 'tech-contributor-b', activeDurationMinutes: 20 },
        ],
      }),
    );

    const result = await service.findById('wo-1');

    expect(result.contributorsWithoutLog).toEqual([]);
  });

  it('returns no notable deviation when estimate is missing', async () => {
    repo.findById.mockResolvedValue(
      buildDetail({
        estimatedDurationMinutes: null,
        interventionLogs: [{ technicianId: 'tech-principal', activeDurationMinutes: 45 }],
      }),
    );

    const result = await service.findById('wo-1');

    expect(result.timeDeviation).toEqual({
      estimatedDurationMinutes: null,
      actualDurationMinutes: 45,
      deltaMinutes: null,
      deltaPercent: null,
    });
    expect(result.hasNotableTimeDeviation).toBe(false);
  });

  it('handles zero estimate without dividing by zero', async () => {
    repo.findById.mockResolvedValue(
      buildDetail({
        estimatedDurationMinutes: 0,
        interventionLogs: [{ technicianId: 'tech-principal', activeDurationMinutes: 0 }],
      }),
    );

    const result = await service.findById('wo-1');

    expect(result.timeDeviation).toEqual({
      estimatedDurationMinutes: 0,
      actualDurationMinutes: 0,
      deltaMinutes: 0,
      deltaPercent: null,
    });
    expect(result.hasNotableTimeDeviation).toBe(false);
  });
});
