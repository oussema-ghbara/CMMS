/**
 * Unit tests for the unit cost trend display logic (spec §10.6).
 *
 * Covers:
 *  1. Trend direction calculation (up / down / flat)
 *  2. formatCurrency output format
 *  3. Month string derivation from UnitCostTrendPartEntry
 *
 * No React components are rendered — display helpers are tested in isolation.
 */

import type { UnitCostTrendPartEntry } from './inventory.api';

// ── Helpers reproduced from stock-analytics-board.tsx ────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

type TrendDirection = 'up' | 'down' | 'flat';

function computeTrendDirection(entry: UnitCostTrendPartEntry): TrendDirection {
  if (entry.trend.length < 2) return 'flat';
  const first = entry.trend[0].avgUnitCost;
  const last = entry.trend[entry.trend.length - 1].avgUnitCost;
  const delta = last - first;
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function getFirstMonth(entry: UnitCostTrendPartEntry): string | null {
  return entry.trend[0]?.month ?? null;
}

function getLastMonth(entry: UnitCostTrendPartEntry): string | null {
  return entry.trend[entry.trend.length - 1]?.month ?? null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeTrendDirection', () => {
  it('returns "up" when last month cost is higher than first', () => {
    const entry: UnitCostTrendPartEntry = {
      partId: 'p1', partName: 'Bearing', partReference: 'BRG-01',
      trend: [
        { month: '2026-01', avgUnitCost: 10 },
        { month: '2026-02', avgUnitCost: 12 },
      ],
    };
    expect(computeTrendDirection(entry)).toBe('up');
  });

  it('returns "down" when last month cost is lower than first', () => {
    const entry: UnitCostTrendPartEntry = {
      partId: 'p1', partName: 'Bearing', partReference: 'BRG-01',
      trend: [
        { month: '2026-01', avgUnitCost: 15 },
        { month: '2026-03', avgUnitCost: 12 },
      ],
    };
    expect(computeTrendDirection(entry)).toBe('down');
  });

  it('returns "flat" when first and last costs are equal', () => {
    const entry: UnitCostTrendPartEntry = {
      partId: 'p1', partName: 'Seal', partReference: 'SL-01',
      trend: [
        { month: '2026-01', avgUnitCost: 8 },
        { month: '2026-02', avgUnitCost: 8 },
      ],
    };
    expect(computeTrendDirection(entry)).toBe('flat');
  });

  it('returns "flat" when trend has only one data point', () => {
    const entry: UnitCostTrendPartEntry = {
      partId: 'p1', partName: 'Filter', partReference: 'FLT-01',
      trend: [{ month: '2026-04', avgUnitCost: 5 }],
    };
    expect(computeTrendDirection(entry)).toBe('flat');
  });

  it('returns "flat" when trend is empty', () => {
    const entry: UnitCostTrendPartEntry = {
      partId: 'p1', partName: 'Cap', partReference: 'CAP-01',
      trend: [],
    };
    expect(computeTrendDirection(entry)).toBe('flat');
  });

  it('correctly handles multi-month series using only first and last values', () => {
    const entry: UnitCostTrendPartEntry = {
      partId: 'p1', partName: 'Pump', partReference: 'PMP-01',
      trend: [
        { month: '2026-01', avgUnitCost: 10 },
        { month: '2026-02', avgUnitCost: 15 },
        { month: '2026-03', avgUnitCost: 9 },
      ],
    };
    // first=10, last=9 → down
    expect(computeTrendDirection(entry)).toBe('down');
  });
});

describe('getFirstMonth / getLastMonth', () => {
  const entry: UnitCostTrendPartEntry = {
    partId: 'p1', partName: 'Belt', partReference: 'BLT-01',
    trend: [
      { month: '2026-02', avgUnitCost: 9 },
      { month: '2026-03', avgUnitCost: 9.5 },
      { month: '2026-04', avgUnitCost: 10 },
    ],
  };

  it('returns the first month string', () => {
    expect(getFirstMonth(entry)).toBe('2026-02');
  });

  it('returns the last month string', () => {
    expect(getLastMonth(entry)).toBe('2026-04');
  });

  it('returns null for an empty trend', () => {
    const empty: UnitCostTrendPartEntry = { partId: 'p', partName: 'x', partReference: 'y', trend: [] };
    expect(getFirstMonth(empty)).toBeNull();
    expect(getLastMonth(empty)).toBeNull();
  });
});

describe('formatCurrency', () => {
  it('formats a round number with EUR symbol', () => {
    const result = formatCurrency(10);
    expect(result).toContain('€');
    expect(result).toContain('10');
  });

  it('formats a decimal to 2 places', () => {
    const result = formatCurrency(7.6666);
    expect(result).toContain('7,67');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });
});
