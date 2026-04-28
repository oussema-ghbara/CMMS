import { workOrdersApi } from './work-orders.api';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('workOrdersApi.getById', () => {
  it('requests /work-orders/:id and returns payload including validation insights', async () => {
    const payload = {
      id: 'wo-1',
      contributorsWithoutLog: [{ technicianId: 'tech-2', name: 'Contributor B' }],
      hasNotableTimeDeviation: true,
      timeDeviation: {
        estimatedDurationMinutes: 120,
        actualDurationMinutes: 170,
        deltaMinutes: 50,
        deltaPercent: 41.67,
      },
    };

    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getById('wo-1');

    expect(api.get).toHaveBeenCalledWith('/work-orders/wo-1');
    expect(result).toEqual(payload);
  });

  it('intervention logs include isReassignmentRemnant field', async () => {
    const log = {
      id: 'log-1',
      technicianId: 'tech-1',
      technician: { id: 'tech-1', name: 'Alice' },
      startedAt: '2026-04-20T10:00:00Z',
      endedAt: '2026-04-20T11:00:00Z',
      activeDurationMinutes: 60,
      result: null,
      resultExplanation: null,
      hourlyRateAtTime: null,
      isReassignmentRemnant: true,
      actions: [],
    };
    const payload = { id: 'wo-1', interventionLogs: [log] };

    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getById('wo-1');

    expect(result.interventionLogs?.[0].isReassignmentRemnant).toBe(true);
  });
});

describe('workOrdersApi.promote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends newPrincipalId with optional reason and reasonDetail', async () => {
    const payload = { id: 'wo-1' };
    (api.patch as jest.Mock).mockResolvedValue({ data: payload });

    await workOrdersApi.promote('wo-1', {
      newPrincipalId: 'tech-new',
      reason: 'SPECIFIC_SKILL_REQUIRED' as never,
      reasonDetail: 'Welding expertise needed',
    });

    expect(api.patch).toHaveBeenCalledWith('/work-orders/wo-1/promote', {
      newPrincipalId: 'tech-new',
      reason: 'SPECIFIC_SKILL_REQUIRED',
      reasonDetail: 'Welding expertise needed',
    });
  });

  it('sends only newPrincipalId when reason is omitted', async () => {
    const payload = { id: 'wo-1' };
    (api.patch as jest.Mock).mockResolvedValue({ data: payload });

    await workOrdersApi.promote('wo-1', { newPrincipalId: 'tech-new' });

    expect(api.patch).toHaveBeenCalledWith('/work-orders/wo-1/promote', {
      newPrincipalId: 'tech-new',
    });
  });
});

describe('workOrdersApi.updateHoldMetadata', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the supervisor asset status choice with hold metadata updates', async () => {
    const payload = { id: 'wo-1' };
    (api.patch as jest.Mock).mockResolvedValue({ data: payload });

    await workOrdersApi.updateHoldMetadata('wo-1', {
      expectedResolutionDate: '2026-05-01T10:00:00.000Z',
      supervisorAssetStatusChoice: 'OUT_OF_SERVICE' as never,
    });

    expect(api.patch).toHaveBeenCalledWith('/work-orders/wo-1/hold-metadata', {
      expectedResolutionDate: '2026-05-01T10:00:00.000Z',
      supervisorAssetStatusChoice: 'OUT_OF_SERVICE',
    });
  });
});

describe('workOrdersApi.list — technicianId filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes technicianId to the GET /work-orders query string', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ technicianId: 'tech-42' });

    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { technicianId: 'tech-42' },
    });
  });

  it('omits technicianId when not provided', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ status: 'OPEN' as never });

    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { status: 'OPEN' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9.8 — workOrdersApi.getAnalytics: technicianKpis.rejectionRateByCategory
// ─────────────────────────────────────────────────────────────────────────────
describe('workOrdersApi.getAnalytics — rejectionRateByCategory (§9.8)', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeAnalyticsPayload(technicianKpis: unknown[]) {
    return {
      periodDays: 30,
      categoryId: null,
      summary: { total: 0, open: 0, overdue: 0, closedThisPeriod: 0, cancelledThisPeriod: 0, resolutionRate: null },
      byStatus: {}, byType: {}, byPriority: {},
      avgResolutionDays: null,
      costSummary: { laborCost: 0, partsCost: 0, contractorCost: 0, totalCost: 0 },
      assetKpis: { globalMtbfDays: null, globalMttrHours: null, topByFailureFrequency: [], topByCost: [], preventiveComplianceRate: null, totalMaintenanceCost: 0 },
      technicianKpis,
      requesterAnalytics: { totalReportsSubmitted: 0, totalConverted: 0, conversionRate: null, reportToActionAvgDays: null },
      preventivePlanEfficiency: { complianceRate: null, anomalyRate: null, totalPreventiveWOs: 0, closedPreventiveWOs: 0 },
      operationalOverview: { sourceDistribution: {}, rejectionReasonDistribution: {}, reassignmentCount: 0, avgHoldPeriodsPerWo: null },
    };
  }

  it('returns technicianKpis with rejectionCount, rejectionRate, and rejectionRateByCategory', async () => {
    const payload = makeAnalyticsPayload([
      {
        technicianId: 'tech-1',
        name: 'Alice',
        closedCount: 4,
        rejectionCount: 2,
        rejectionRate: 0.5,
        rejectionRateByCategory: {
          INSUFFICIENT_DESCRIPTION: { count: 1, rate: 0.25 },
          PARTS_USED_MISMATCH: { count: 1, rate: 0.25 },
        },
        avgActiveDurationMinutes: 90,
        firstPassRate: 0.5,
        avgHoldPerWo: 0.5,
        avgResponseTimeHours: 2.5,
      },
    ]);
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getAnalytics({ periodDays: 30 });

    expect(api.get).toHaveBeenCalledWith('/work-orders/analytics', { params: { periodDays: 30 } });
    const tech = result.technicianKpis[0];
    expect(tech.rejectionCount).toBe(2);
    expect(tech.rejectionRate).toBe(0.5);
    expect(tech.rejectionRateByCategory).toEqual({
      INSUFFICIENT_DESCRIPTION: { count: 1, rate: 0.25 },
      PARTS_USED_MISMATCH: { count: 1, rate: 0.25 },
    });
  });

  it('returns empty rejectionRateByCategory when technician has no rejections', async () => {
    const payload = makeAnalyticsPayload([
      {
        technicianId: 'tech-2',
        name: 'Bob',
        closedCount: 3,
        rejectionCount: 0,
        rejectionRate: 0,
        rejectionRateByCategory: {},
        avgActiveDurationMinutes: null,
        firstPassRate: 1,
        avgHoldPerWo: 0,
        avgResponseTimeHours: null,
      },
    ]);
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getAnalytics({ periodDays: 30 });

    const tech = result.technicianKpis[0];
    expect(tech.rejectionCount).toBe(0);
    expect(tech.rejectionRate).toBe(0);
    expect(tech.rejectionRateByCategory).toEqual({});
  });

  it('handles empty technicianKpis array', async () => {
    const payload = makeAnalyticsPayload([]);
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getAnalytics({ periodDays: 30 });

    expect(result.technicianKpis).toHaveLength(0);
  });
});
