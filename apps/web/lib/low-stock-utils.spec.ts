/**
 * Unit tests for low-stock-utils.
 *
 * These helpers drive the §10.5 dedicated low-stock view: sorting by deficit
 * severity, by name, and by current stock. The deficit computation is the
 * primary business rule: threshold − currentStock must be positive (since the
 * endpoint only returns parts below threshold).
 *
 * Failure scenario: if the sort direction toggle is wrong, clicking a column
 * header twice would not reverse the order, leaving the storekeeper unable to
 * identify the least-critical items.
 *
 * Regression safety: sortLowStockParts returns a new array, never mutating the
 * original, so React Query's cache is not accidentally modified.
 */

import { computeDeficit, sortLowStockParts, toggleSortDir } from './low-stock-utils';
import type { PartCatalogItem } from './inventory.api';
import { PartUnit } from '@gmao/shared';

function makePart(overrides: Partial<PartCatalogItem> & { name: string; currentStock: number; minimumStockThreshold: number }): PartCatalogItem {
  return {
    id: overrides.name,
    referenceCode: `REF-${overrides.name}`,
    description: null,
    unit: PartUnit.PIECE,
    warehouseLocation: null,
    unitCost: '10.00',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const PUMP_SEAL = makePart({ name: 'Pump Seal', currentStock: 1, minimumStockThreshold: 5 });   // deficit 4
const OIL_FILTER = makePart({ name: 'Oil Filter', currentStock: 0, minimumStockThreshold: 10 }); // deficit 10
const BOLT_M8 = makePart({ name: 'Bolt M8', currentStock: 3, minimumStockThreshold: 6 });        // deficit 3

describe('computeDeficit', () => {
  it('returns threshold minus currentStock', () => {
    expect(computeDeficit(PUMP_SEAL)).toBe(4);
    expect(computeDeficit(OIL_FILTER)).toBe(10);
    expect(computeDeficit(BOLT_M8)).toBe(3);
  });

  it('returns 0 when stock equals threshold (edge case)', () => {
    const part = makePart({ name: 'Edge', currentStock: 5, minimumStockThreshold: 5 });
    expect(computeDeficit(part)).toBe(0);
  });
});

describe('sortLowStockParts', () => {
  const parts = [PUMP_SEAL, OIL_FILTER, BOLT_M8];

  describe('sort by deficit', () => {
    it('desc: highest deficit first', () => {
      const result = sortLowStockParts(parts, 'deficit', 'desc');
      expect(result.map((p) => p.name)).toEqual(['Oil Filter', 'Pump Seal', 'Bolt M8']);
    });

    it('asc: lowest deficit first', () => {
      const result = sortLowStockParts(parts, 'deficit', 'asc');
      expect(result.map((p) => p.name)).toEqual(['Bolt M8', 'Pump Seal', 'Oil Filter']);
    });
  });

  describe('sort by currentStock', () => {
    it('desc: highest stock first', () => {
      const result = sortLowStockParts(parts, 'currentStock', 'desc');
      expect(result.map((p) => p.name)).toEqual(['Bolt M8', 'Pump Seal', 'Oil Filter']);
    });

    it('asc: lowest stock first', () => {
      const result = sortLowStockParts(parts, 'currentStock', 'asc');
      expect(result.map((p) => p.name)).toEqual(['Oil Filter', 'Pump Seal', 'Bolt M8']);
    });
  });

  describe('sort by name', () => {
    it('asc: alphabetical order', () => {
      const result = sortLowStockParts(parts, 'name', 'asc');
      expect(result.map((p) => p.name)).toEqual(['Bolt M8', 'Oil Filter', 'Pump Seal']);
    });

    it('desc: reverse alphabetical', () => {
      const result = sortLowStockParts(parts, 'name', 'desc');
      expect(result.map((p) => p.name)).toEqual(['Pump Seal', 'Oil Filter', 'Bolt M8']);
    });
  });

  it('does not mutate the original array', () => {
    const original = [...parts];
    sortLowStockParts(parts, 'deficit', 'asc');
    expect(parts).toEqual(original);
  });

  it('returns an empty array when input is empty', () => {
    expect(sortLowStockParts([], 'deficit', 'desc')).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    const result = sortLowStockParts([PUMP_SEAL], 'deficit', 'desc');
    expect(result).toEqual([PUMP_SEAL]);
  });
});

describe('toggleSortDir', () => {
  it('toggles asc to desc', () => {
    expect(toggleSortDir('asc')).toBe('desc');
  });

  it('toggles desc to asc', () => {
    expect(toggleSortDir('desc')).toBe('asc');
  });
});
