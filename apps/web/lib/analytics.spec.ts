/**
 * Tests for the extended WorkOrderAnalyticsResponse contract and
 * the AssetHealthItem interface.
 */

import type {
  WorkOrderAnalyticsResponse,
  AssetHealthItem,
  TechnicianKpiItem,
} from './work-orders.api';

describe('WorkOrderAnalyticsResponse extended contract', () => {
  it('accepts a minimal valid response with all KPI sections', () => {
    const response: WorkOrderAnalyticsResponse = {
      periodDays: 30,
      categoryId: null,
      summary: {
        total: 10,
        open: 3,
        overdue: 1,
        closedThisPeriod: 5,
        cancelledThisPeriod: 1,
        resolutionRate: 0.83,
      },
      byStatus: {},
      byType: {},
      byPriority: {},
      avgResolutionDays: 4.5,
      costSummary: { laborCost: 100, partsCost: 50, contractorCost: 0, totalCost: 150 },
      assetKpis: {
        globalMtbfDays: 30,
        globalMttrHours: 8,
        topByFailureFrequency: [],
        topByCost: [],
        preventiveComplianceRate: 0.9,
        totalMaintenanceCost: 150,
      },
      technicianKpis: [],
      requesterAnalytics: {
        totalReportsSubmitted: 5,
        totalConverted: 3,
        conversionRate: 0.6,
        reportToActionAvgDays: 1.5,
        reportAccuracyRate: 0.8,
        duplicateSubmissionRate: 0.1,
      },
      preventivePlanEfficiency: {
        complianceRate: 0.9,
        anomalyRate: 0.05,
        totalPreventiveWOs: 10,
        closedPreventiveWOs: 9,
      },
      operationalOverview: {
        sourceDistribution: {},
        rejectionReasonDistribution: {},
        reassignmentCount: 2,
        avgHoldPeriodsPerWo: 0.3,
      },
    };

    expect(response.periodDays).toBe(30);
    expect(response.categoryId).toBeNull();
    expect(response.assetKpis.globalMtbfDays).toBe(30);
    expect(response.assetKpis.globalMttrHours).toBe(8);
    expect(response.technicianKpis).toHaveLength(0);
    expect(response.requesterAnalytics.conversionRate).toBe(0.6);
    expect(response.preventivePlanEfficiency.anomalyRate).toBe(0.05);
    expect(response.operationalOverview.reassignmentCount).toBe(2);
  });

  it('accepts null values for all nullable KPI fields', () => {
    const response: WorkOrderAnalyticsResponse = {
      periodDays: 30,
      categoryId: null,
      summary: { total: 0, open: 0, overdue: 0, closedThisPeriod: 0, cancelledThisPeriod: 0, resolutionRate: null },
      byStatus: {},
      byType: {},
      byPriority: {},
      avgResolutionDays: null,
      costSummary: { laborCost: 0, partsCost: 0, contractorCost: 0, totalCost: 0 },
      assetKpis: {
        globalMtbfDays: null,
        globalMttrHours: null,
        topByFailureFrequency: [],
        topByCost: [],
        preventiveComplianceRate: null,
        totalMaintenanceCost: 0,
      },
      technicianKpis: [],
      requesterAnalytics: { totalReportsSubmitted: 0, totalConverted: 0, conversionRate: null, reportToActionAvgDays: null, reportAccuracyRate: null, duplicateSubmissionRate: null },
      preventivePlanEfficiency: { complianceRate: null, anomalyRate: null, totalPreventiveWOs: 0, closedPreventiveWOs: 0 },
      operationalOverview: { sourceDistribution: {}, rejectionReasonDistribution: {}, reassignmentCount: 0, avgHoldPeriodsPerWo: null },
    };

    expect(response.assetKpis.globalMtbfDays).toBeNull();
    expect(response.requesterAnalytics.conversionRate).toBeNull();
    expect(response.preventivePlanEfficiency.anomalyRate).toBeNull();
  });
});

describe('AssetHealthItem contract', () => {
  it('has required fields', () => {
    const item: AssetHealthItem = {
      assetId: 'asset-1',
      assetName: 'Pump A',
      qrCode: 'QR-001',
      failureCount: 4,
      lastFailureDate: '2026-04-20T10:00:00Z',
    };

    expect(item.failureCount).toBe(4);
    expect(item.qrCode).toBe('QR-001');
  });
});

describe('TechnicianKpiItem contract', () => {
  it('accepts full performance data', () => {
    const item: TechnicianKpiItem = {
      technicianId: 'tech-1',
      name: 'Alice',
      closedCount: 15,
      rejectionCount: 2,
      rejectionRate: 0.13,
      rejectionRateByCategory: {},
      avgActiveDurationMinutes: 120.5,
      firstPassRate: 0.87,
      avgHoldPerWo: 0.2,
      avgResponseTimeHours: 2.3,
    };

    expect(item.closedCount).toBe(15);
    expect(item.firstPassRate).toBe(0.87);
    expect(item.rejectionCount).toBe(2);
  });

  it('accepts null values for optional metrics', () => {
    const item: TechnicianKpiItem = {
      technicianId: 'tech-2',
      name: 'Bob',
      closedCount: 0,
      rejectionCount: 0,
      rejectionRate: null,
      rejectionRateByCategory: {},
      avgActiveDurationMinutes: null,
      firstPassRate: null,
      avgHoldPerWo: null,
      avgResponseTimeHours: null,
    };

    expect(item.avgActiveDurationMinutes).toBeNull();
    expect(item.rejectionRate).toBeNull();
  });
});
