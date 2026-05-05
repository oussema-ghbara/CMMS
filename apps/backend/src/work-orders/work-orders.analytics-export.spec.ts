import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService.getAnalyticsPdf', () => {
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

  it('returns a non-empty PDF buffer based on analytics payload', async () => {
    const service = makeService();

    jest.spyOn(service, 'getAnalytics').mockResolvedValue({
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
      avgResolutionDays: 2.4,
      costSummary: {
        laborCost: 100,
        partsCost: 50,
        contractorCost: 20,
        totalCost: 170,
      },
      assetKpis: {
        globalMtbfDays: null,
        globalMttrHours: null,
        topByFailureFrequency: [
          {
            assetId: 'asset-1',
            assetName: 'Compresseur 1',
            failureCount: 3,
            lastFailureDate: new Date('2026-05-01T10:00:00.000Z').toISOString(),
          },
        ],
        topByCost: [],
        preventiveComplianceRate: null,
        totalMaintenanceCost: 170,
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
    } as never);

    const pdf = await service.getAnalyticsPdf(30);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(20);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(service.getAnalytics).toHaveBeenCalledWith(30, undefined);
  });

  it('forwards categoryId to getAnalytics before generating the PDF', async () => {
    const service = makeService();

    jest.spyOn(service, 'getAnalytics').mockResolvedValue({
      periodDays: 14,
      categoryId: 'cat-1',
      summary: {
        total: 0,
        open: 0,
        overdue: 0,
        closedThisPeriod: 0,
        cancelledThisPeriod: 0,
        resolutionRate: null,
      },
      byStatus: {},
      byType: {},
      byPriority: {},
      avgResolutionDays: null,
      costSummary: {
        laborCost: 0,
        partsCost: 0,
        contractorCost: 0,
        totalCost: 0,
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
    } as never);

    await service.getAnalyticsPdf(14, 'cat-1');

    expect(service.getAnalytics).toHaveBeenCalledWith(14, 'cat-1');
  });

  it('propagates failures when analytics retrieval fails', async () => {
    const service = makeService();
    jest.spyOn(service, 'getAnalytics').mockRejectedValue(new Error('analytics failed'));

    await expect(service.getAnalyticsPdf(30)).rejects.toThrow('analytics failed');
  });
});
