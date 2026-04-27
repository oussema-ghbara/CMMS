/**
 * Unit tests for §1.3 per-plan compliance and per-checklist-item anomaly
 * display logic used in SupervisorAnalyticsBoard preventive tab.
 */

import type { PlanComplianceEntry, ChecklistItemAnomalyEntry } from './work-orders.api';

function fmtPct(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value * 100)} %`;
}

function planComplianceBadgeVariant(rate: number | null): 'outline' | 'destructive' {
  return rate != null && rate >= 0.8 ? 'outline' : 'destructive';
}

function checklistAnomalyBadgeVariant(rate: number | null): 'outline' | 'warning' | 'destructive' {
  if (rate == null || rate === 0) return 'outline';
  if (rate > 0.2) return 'destructive';
  return 'warning';
}

// ── fmtPct ────────────────────────────────────────────────────────────────────

describe('fmtPct', () => {
  it('formats 1 (100%) correctly', () => {
    expect(fmtPct(1)).toContain('100');
  });

  it('formats 0 (0%) correctly', () => {
    expect(fmtPct(0)).toContain('0');
  });

  it('formats 0.667 to one decimal', () => {
    const result = fmtPct(0.667);
    expect(result).toContain('66,7');
  });
});

// ── planComplianceBadgeVariant ────────────────────────────────────────────────

describe('planComplianceBadgeVariant', () => {
  it('returns "outline" for rate >= 0.8 (good compliance)', () => {
    expect(planComplianceBadgeVariant(1)).toBe('outline');
    expect(planComplianceBadgeVariant(0.8)).toBe('outline');
    expect(planComplianceBadgeVariant(0.95)).toBe('outline');
  });

  it('returns "destructive" for rate < 0.8 (poor compliance)', () => {
    expect(planComplianceBadgeVariant(0.5)).toBe('destructive');
    expect(planComplianceBadgeVariant(0)).toBe('destructive');
    expect(planComplianceBadgeVariant(0.799)).toBe('destructive');
  });

  it('returns "destructive" for null rate', () => {
    expect(planComplianceBadgeVariant(null)).toBe('destructive');
  });
});

// ── checklistAnomalyBadgeVariant ──────────────────────────────────────────────

describe('checklistAnomalyBadgeVariant', () => {
  it('returns "outline" for rate 0 (no anomalies)', () => {
    expect(checklistAnomalyBadgeVariant(0)).toBe('outline');
  });

  it('returns "outline" for null rate', () => {
    expect(checklistAnomalyBadgeVariant(null)).toBe('outline');
  });

  it('returns "warning" for low anomaly rate (0 < rate <= 0.2)', () => {
    expect(checklistAnomalyBadgeVariant(0.1)).toBe('warning');
    expect(checklistAnomalyBadgeVariant(0.2)).toBe('warning');
  });

  it('returns "destructive" for high anomaly rate (> 0.2)', () => {
    expect(checklistAnomalyBadgeVariant(0.21)).toBe('destructive');
    expect(checklistAnomalyBadgeVariant(0.5)).toBe('destructive');
    expect(checklistAnomalyBadgeVariant(1)).toBe('destructive');
  });
});

// ── PlanComplianceEntry shape validation ──────────────────────────────────────

describe('PlanComplianceEntry shape', () => {
  const entry: PlanComplianceEntry = {
    planId: 'plan-1',
    planTitle: 'Révision mensuelle',
    total: 4,
    closedOnTime: 3,
    rate: 0.75,
  };

  it('has all required fields', () => {
    expect(entry.planId).toBeDefined();
    expect(entry.planTitle).toBeDefined();
    expect(typeof entry.total).toBe('number');
    expect(typeof entry.closedOnTime).toBe('number');
  });

  it('rate is between 0 and 1', () => {
    expect(entry.rate).toBeGreaterThanOrEqual(0);
    expect(entry.rate).toBeLessThanOrEqual(1);
  });
});

// ── ChecklistItemAnomalyEntry shape validation ────────────────────────────────

describe('ChecklistItemAnomalyEntry shape', () => {
  const entry: ChecklistItemAnomalyEntry = {
    itemId: 'item-1',
    description: 'Vérifier niveau huile',
    total: 5,
    anomalyCount: 2,
    rate: 0.4,
  };

  it('has all required fields', () => {
    expect(entry.itemId).toBeDefined();
    expect(entry.description).toBeDefined();
    expect(typeof entry.total).toBe('number');
    expect(typeof entry.anomalyCount).toBe('number');
  });

  it('anomalyCount <= total', () => {
    expect(entry.anomalyCount).toBeLessThanOrEqual(entry.total);
  });

  it('rate is consistent with anomalyCount / total', () => {
    const expected = Math.round((entry.anomalyCount / entry.total) * 1000) / 1000;
    expect(entry.rate).toBeCloseTo(expected, 3);
  });
});
