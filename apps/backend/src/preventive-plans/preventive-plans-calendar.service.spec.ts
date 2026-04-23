import { Test, TestingModule } from '@nestjs/testing';
import { PreventivePlansService } from './preventive-plans.service';
import { PreventivePlansRepository } from './preventive-plans.repository';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getQueueToken } from '@nestjs/bullmq';
import { PREVENTIVE_PLAN_QUEUE } from './preventive-plans.constants';

function makePlan(overrides: {
  id?: string;
  nextDueAt?: Date | null;
  frequencyType?: string;
  intervalDays?: number | null;
  estimatedDurationMinutes?: number | null;
  defaultTechnicianId?: string | null;
}) {
  return {
    id: overrides.id ?? 'plan-1',
    title: 'Monthly Pump Check',
    assetId: 'asset-1',
    isActive: true,
    nextDueAt: overrides.nextDueAt ?? null,
    frequencyType: overrides.frequencyType ?? 'FIXED_INTERVAL_DAYS',
    intervalDays: overrides.intervalDays ?? 30,
    calendarExpression: null,
    estimatedDurationMinutes: overrides.estimatedDurationMinutes ?? null,
    defaultTechnicianId: overrides.defaultTechnicianId ?? null,
    asset: { id: 'asset-1', name: 'Pump A', qrCodeIdentifier: 'QR001', status: 'OPERATIONAL' },
    defaultTechnician: overrides.defaultTechnicianId
      ? { id: overrides.defaultTechnicianId, name: 'Alice', email: 'alice@test.com' }
      : null,
    checklistItems: [],
  };
}

describe('PreventivePlansService.getCalendarPreview', () => {
  let service: PreventivePlansService;
  let repo: jest.Mocked<PreventivePlansRepository>;

  beforeEach(async () => {
    const mockRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      updateNextDueAt: jest.fn(),
      addChecklistItem: jest.fn(),
      updateChecklistItem: jest.fn(),
      deleteChecklistItem: jest.fn(),
      reorderChecklistItems: jest.fn(),
      findDuePlans: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreventivePlansService,
        { provide: PreventivePlansRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: { user: { findFirst: jest.fn() } } },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifySupervisors: jest.fn() } },
        { provide: getQueueToken(PREVENTIVE_PLAN_QUEUE), useValue: { add: jest.fn(), addBulk: jest.fn() } },
      ],
    }).compile();

    service = module.get(PreventivePlansService);
    repo = module.get(PreventivePlansRepository) as jest.Mocked<PreventivePlansRepository>;
  });

  it('returns empty array when no active plans have nextDueAt set', async () => {
    (repo.findAll as jest.Mock).mockResolvedValue({ data: [makePlan({ nextDueAt: null })], total: 1 });

    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');

    const result = await service.getCalendarPreview(from, to);

    expect(result).toHaveLength(0);
  });

  it('returns items for a plan whose nextDueAt falls within the window', async () => {
    const nextDueAt = new Date('2026-01-10');
    (repo.findAll as jest.Mock).mockResolvedValue({
      data: [makePlan({ nextDueAt, intervalDays: 90 })],
      total: 1,
    });

    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');

    const result = await service.getCalendarPreview(from, to);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].planTitle).toBe('Monthly Pump Check');
    expect(result[0].assetName).toBe('Pump A');
    expect(result[0].generationDate).toContain('2026-01-10');
  });

  it('projects multiple occurrences within the window (30-day interval)', async () => {
    const nextDueAt = new Date('2026-01-05');
    (repo.findAll as jest.Mock).mockResolvedValue({
      data: [makePlan({ nextDueAt, intervalDays: 30 })],
      total: 1,
    });

    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');

    const result = await service.getCalendarPreview(from, to);

    // 3 occurrences: Jan 5, Feb 4, Mar 6
    expect(result.length).toBe(3);
  });

  it('excludes occurrences before fromDate', async () => {
    const nextDueAt = new Date('2025-12-15');
    (repo.findAll as jest.Mock).mockResolvedValue({
      data: [makePlan({ nextDueAt, intervalDays: 30 })],
      total: 1,
    });

    const from = new Date('2026-01-01');
    const to = new Date('2026-02-28');

    const result = await service.getCalendarPreview(from, to);

    result.forEach((item) => {
      expect(new Date(item.generationDate) >= from).toBe(true);
    });
  });

  it('returns sorted results by generationDate when multiple plans are present', async () => {
    const planA = makePlan({ id: 'plan-a', nextDueAt: new Date('2026-01-20'), intervalDays: 90 });
    const planB = makePlan({ id: 'plan-b', nextDueAt: new Date('2026-01-10'), intervalDays: 90 });
    (repo.findAll as jest.Mock).mockResolvedValue({ data: [planA, planB], total: 2 });

    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');

    const result = await service.getCalendarPreview(from, to);

    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i].generationDate) >= new Date(result[i - 1].generationDate)).toBe(true);
    }
  });

  it('includes defaultTechnicianName when plan has a default technician', async () => {
    const nextDueAt = new Date('2026-01-10');
    (repo.findAll as jest.Mock).mockResolvedValue({
      data: [makePlan({ nextDueAt, intervalDays: 90, defaultTechnicianId: 'tech-1' })],
      total: 1,
    });

    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');

    const result = await service.getCalendarPreview(from, to);

    expect(result[0].defaultTechnicianName).toBe('Alice');
    expect(result[0].defaultTechnicianId).toBe('tech-1');
  });

  it('returns null defaultTechnicianId when plan has no default technician', async () => {
    const nextDueAt = new Date('2026-01-10');
    (repo.findAll as jest.Mock).mockResolvedValue({
      data: [makePlan({ nextDueAt, intervalDays: 90 })],
      total: 1,
    });

    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');

    const result = await service.getCalendarPreview(from, to);

    expect(result[0].defaultTechnicianId).toBeNull();
    expect(result[0].defaultTechnicianName).toBeNull();
  });
});
