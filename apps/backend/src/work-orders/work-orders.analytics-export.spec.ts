import { WorkOrdersService } from './work-orders.service';

function makeService() {
  return new WorkOrdersService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function fullAnalytics(overrides: Record<string, any> = {}) {
  return {
    periodDays: 30,
    categoryId: null,
    summary: {
      total: 12,
      open: 4,
      overdue: 2,
      closedThisPeriod: 6,
      cancelledThisPeriod: 2,
      resolutionRate: 0.75,
    },
    byStatus: {},
    byType: {},
    byPriority: {},
    avgResolutionDays: 3.5,
    costSummary: { laborCost: 1200.5, partsCost: 350, contractorCost: 0, totalCost: 1550.5 },
    assetKpis: {
      globalMtbfDays: 14.2,
      globalMttrHours: 2.8,
      topByFailureFrequency: [
        { assetId: 'a1', assetName: 'Compresseur A', failureCount: 5, lastFailureDate: new Date('2026-04-20T08:00:00Z').toISOString() },
      ],
      topByCost: [
        { assetId: 'a1', assetName: 'Compresseur A', totalCost: 900 },
      ],
      preventiveComplianceRate: 0.8,
      totalMaintenanceCost: 1550.5,
      perAsset: [],
    },
    technicianKpis: [
      {
        technicianId: 't1',
        technicianName: 'Alice Martin',
        closedWoCount: 8,
        firstPassRate: 0.875,
        avgDurationMinutes: 95,
        avgResponseTimeHours: null,
        avgHoldPeriods: 0,
        rejectionCount: 0,
        rejectionRate: 0,
        rejectionRateByCategory: {},
      },
    ],
    requesterAnalytics: {
      totalReportsSubmitted: 20,
      totalConverted: 15,
      conversionRate: 0.75,
      reportToActionAvgDays: 1.3,
      reportAccuracyRate: 0.9,
      duplicateSubmissionRate: 0.05,
    },
    preventivePlanEfficiency: {
      complianceRate: 0.8,
      anomalyRate: 0.12,
      totalPreventiveWOs: 10,
      closedPreventiveWOs: 8,
      postPreventiveCorrectiveRate: 0.1,
      postPreventiveCorrectiveWindowDays: 7,
      compliancePerPlan: [],
      anomalyPerChecklistItem: [],
    },
    operationalOverview: {
      sourceDistribution: { MANUAL: 6, PROBLEM_REPORT: 4 },
      rejectionReasonDistribution: {},
      reassignmentCount: 3,
      avgHoldPeriodsPerWo: 1.2,
    },
    ...overrides,
  } as never;
}

async function pdfText(service: WorkOrdersService, analytics: any): Promise<string> {
  const buf = await service.getAnalyticsPdf(analytics.periodDays, analytics.categoryId ?? undefined);
  return buf.toString('latin1');
}

describe('WorkOrdersService.getAnalyticsPdf', () => {
  it('returns a valid PDF buffer', async () => {
    const service = makeService();
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(fullAnalytics());

    const buf = await service.getAnalyticsPdf(30);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('forwards periodDays and categoryId to getAnalytics', async () => {
    const service = makeService();
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(fullAnalytics({ periodDays: 14, categoryId: 'cat-1' }));

    await service.getAnalyticsPdf(14, 'cat-1');

    expect(service.getAnalytics).toHaveBeenCalledWith(14, 'cat-1');
  });

  it('propagates getAnalytics failures', async () => {
    const service = makeService();
    jest.spyOn(service, 'getAnalytics').mockRejectedValue(new Error('db error'));

    await expect(service.getAnalyticsPdf(30)).rejects.toThrow('db error');
  });

  it('renders cost values with currency formatting (not raw numbers)', async () => {
    const service = makeService();
    const analytics = fullAnalytics();
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(analytics);

    const raw = await service.getAnalyticsPdf(30);
    const text = raw.toString('latin1');

    expect(text).toContain('1');
    expect(text).not.toContain('laborCost');
    expect(raw.length).toBeGreaterThan(500);
  });

  it('renders all major sections', async () => {
    const service = makeService();
    const analytics = fullAnalytics();
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(analytics);

    const buf = await service.getAnalyticsPdf(30);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles all-null KPI values without throwing', async () => {
    const service = makeService();
    const analytics = fullAnalytics({
      avgResolutionDays: null,
      summary: {
        total: 0,
        open: 0,
        overdue: 0,
        closedThisPeriod: 0,
        cancelledThisPeriod: 0,
        resolutionRate: null,
      },
      assetKpis: {
        globalMtbfDays: null,
        globalMttrHours: null,
        topByFailureFrequency: [],
        topByCost: [],
        preventiveComplianceRate: null,
        totalMaintenanceCost: 0,
        perAsset: [],
      },
      technicianKpis: [],
      requesterAnalytics: {
        totalReportsSubmitted: 0,
        totalConverted: 0,
        conversionRate: null,
        reportToActionAvgDays: null,
        reportAccuracyRate: null,
        duplicateSubmissionRate: null,
      },
      preventivePlanEfficiency: {
        complianceRate: null,
        anomalyRate: null,
        totalPreventiveWOs: 0,
        closedPreventiveWOs: 0,
        postPreventiveCorrectiveRate: null,
        postPreventiveCorrectiveWindowDays: 7,
        compliancePerPlan: [],
        anomalyPerChecklistItem: [],
      },
      operationalOverview: {
        sourceDistribution: {},
        rejectionReasonDistribution: {},
        reassignmentCount: 0,
        avgHoldPeriodsPerWo: null,
      },
    });
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(analytics);

    const buf = await service.getAnalyticsPdf(30);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('handles multiple technicians without throwing', async () => {
    const service = makeService();
    const technicians = Array.from({ length: 12 }, (_, i) => ({
      technicianId: `t${i}`,
      technicianName: `Technician ${i}`,
      closedWoCount: i + 1,
      firstPassRate: i % 2 === 0 ? 0.9 : null,
      avgDurationMinutes: 60 + i * 10,
      avgResponseTimeHours: null,
      avgHoldPeriods: 0,
      rejectionCount: 0,
      rejectionRate: 0,
      rejectionRateByCategory: {},
    }));
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(fullAnalytics({ technicianKpis: technicians }));

    const buf = await service.getAnalyticsPdf(30);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('handles more than 10 failing assets (caps at 10)', async () => {
    const service = makeService();
    const assets = Array.from({ length: 15 }, (_, i) => ({
      assetId: `a${i}`,
      assetName: `Asset ${i}`,
      failureCount: 15 - i,
      lastFailureDate: new Date('2026-04-01T00:00:00Z').toISOString(),
    }));
    const base = fullAnalytics() as any;
    jest.spyOn(service, 'getAnalytics').mockResolvedValue(
      fullAnalytics({ assetKpis: { ...base.assetKpis, topByFailureFrequency: assets } }),
    );

    const buf = await service.getAnalyticsPdf(30);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
