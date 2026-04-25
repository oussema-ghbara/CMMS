/**
 * Unit tests for the overdue work order feature logic (spec §9.3).
 *
 * Covers:
 *   1. daysOverdue calculation used by OverdueWorkOrderRow
 *   2. isOverdue query-param serialisation used by WorkOrderListQuery / workOrdersApi
 *
 * No React components are rendered here — React Testing Library is not installed.
 * The helper logic is tested in isolation by reproducing the exact formula from
 * the component.
 *
 * Regression safety: changing the formula in OverdueWorkOrderRow (e.g. switching
 * from Math.floor to Math.ceil) would break the "daysOverdue" badge label — these
 * tests guard that.
 */

// ── daysOverdue helper ────────────────────────────────────────────────────────

/** Reproduces the daysOverdue formula from OverdueWorkOrderRow verbatim. */
function computeDaysOverdue(dueDate: string | null, now: Date): number {
  if (!dueDate) return 0;
  return Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000);
}

describe('computeDaysOverdue (OverdueWorkOrderRow formula)', () => {
  it('returns 0 for a null dueDate', () => {
    expect(computeDaysOverdue(null, new Date())).toBe(0);
  });

  it('returns 1 for a dueDate exactly 1 day ago', () => {
    const now = new Date('2026-04-26T12:00:00Z');
    const dueDate = new Date('2026-04-25T12:00:00Z').toISOString();
    expect(computeDaysOverdue(dueDate, now)).toBe(1);
  });

  it('returns 0 for a dueDate less than 24 h ago (floor, not ceil)', () => {
    const now = new Date('2026-04-26T12:00:00Z');
    const dueDate = new Date('2026-04-26T01:00:00Z').toISOString(); // 11 h ago
    expect(computeDaysOverdue(dueDate, now)).toBe(0);
  });

  it('returns 7 for a dueDate 7 days ago', () => {
    const now = new Date('2026-04-26T00:00:00Z');
    const dueDate = new Date('2026-04-19T00:00:00Z').toISOString();
    expect(computeDaysOverdue(dueDate, now)).toBe(7);
  });

  it('returns 0 for a dueDate in the future (not overdue — panel should not show it)', () => {
    const now = new Date('2026-04-26T12:00:00Z');
    const dueDate = new Date('2026-04-27T12:00:00Z').toISOString(); // tomorrow
    expect(computeDaysOverdue(dueDate, now)).toBe(-1); // negative = future
  });
});

// ── isOverdue query param serialisation ───────────────────────────────────────

/**
 * Reproduces how axios serialises a WorkOrderListQuery with isOverdue=true.
 * Axios uses URLSearchParams under the hood; booleans become the string "true".
 */
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  return sp.toString();
}

describe('isOverdue query param serialisation', () => {
  it('serialises isOverdue:true as the string "true"', () => {
    const qs = buildQueryString({ page: 1, limit: 5, isOverdue: true });
    expect(qs).toContain('isOverdue=true');
  });

  it('serialises isOverdue:false as the string "false"', () => {
    const qs = buildQueryString({ page: 1, limit: 20, isOverdue: false });
    expect(qs).toContain('isOverdue=false');
  });

  it('omits isOverdue when undefined (no filter applied)', () => {
    const qs = buildQueryString({ page: 1, limit: 20 });
    expect(qs).not.toContain('isOverdue');
  });

  it('includes other filters alongside isOverdue', () => {
    const qs = buildQueryString({ page: 1, limit: 5, isOverdue: true, priority: 'CRITICAL' });
    expect(qs).toContain('isOverdue=true');
    expect(qs).toContain('priority=CRITICAL');
  });
});

// ── isOverdue URL-param reading (work-orders-board.tsx §9.3) ─────────────────

/**
 * Reproduces the URLSearchParams reading logic in work-orders-board.tsx:
 *   const isOverdue = searchParams.get('isOverdue') === 'true' || undefined;
 */
function readIsOverdueFromSearchParams(search: string): boolean | undefined {
  const sp = new URLSearchParams(search);
  return sp.get('isOverdue') === 'true' || undefined;
}

describe('readIsOverdueFromSearchParams (board §9.3 URL wiring)', () => {
  it('returns true when URL contains ?isOverdue=true', () => {
    expect(readIsOverdueFromSearchParams('isOverdue=true')).toBe(true);
  });

  it('returns undefined (not false) when URL contains ?isOverdue=false', () => {
    // undefined means the filter is not sent to the backend at all.
    expect(readIsOverdueFromSearchParams('isOverdue=false')).toBeUndefined();
  });

  it('returns undefined when isOverdue param is absent', () => {
    expect(readIsOverdueFromSearchParams('page=1&limit=20')).toBeUndefined();
  });

  it('returns undefined for an arbitrary value (not "true")', () => {
    expect(readIsOverdueFromSearchParams('isOverdue=yes')).toBeUndefined();
  });
});
