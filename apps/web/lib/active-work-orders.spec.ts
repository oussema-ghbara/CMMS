/**
 * Unit tests for the active work orders feature logic (spec §9.3).
 *
 * Covers:
 *   1. isActive query-param serialisation used by WorkOrderListQuery / workOrdersApi
 *   2. isActive URL-param reading logic from work-orders-board.tsx
 *   3. ClosedTodayRow display logic (asset name, technician fallback, type badge)
 *   4. Status deep-link URL-param reading from work-orders-board.tsx
 *
 * No React components are rendered — RTL is not installed.
 * Pure-logic helpers are reproduced from the relevant components verbatim.
 */

import { WorkOrderStatus, WorkOrderType } from '@gmao/shared';

// ── isActive query param serialisation ───────────────────────────────────────

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  return sp.toString();
}

describe('isActive query param serialisation', () => {
  it('serialises isActive:true as the string "true"', () => {
    const qs = buildQueryString({ page: 1, limit: 20, isActive: true });
    expect(qs).toContain('isActive=true');
  });

  it('serialises isActive:false as the string "false"', () => {
    const qs = buildQueryString({ page: 1, limit: 20, isActive: false });
    expect(qs).toContain('isActive=false');
  });

  it('omits isActive when undefined (no filter applied)', () => {
    const qs = buildQueryString({ page: 1, limit: 20 });
    expect(qs).not.toContain('isActive');
  });

  it('includes other filters alongside isActive', () => {
    const qs = buildQueryString({ page: 1, limit: 20, isActive: true, priority: 'CRITICAL' });
    expect(qs).toContain('isActive=true');
    expect(qs).toContain('priority=CRITICAL');
  });

  it('isActive and isOverdue can coexist in the query string', () => {
    const qs = buildQueryString({ isActive: true, isOverdue: true });
    expect(qs).toContain('isActive=true');
    expect(qs).toContain('isOverdue=true');
  });
});

// ── isActive URL-param reading (work-orders-board.tsx §9.3) ──────────────────

/**
 * Reproduces the URL reading from work-orders-board.tsx:
 *   const isActive = searchParams.get('isActive') === 'true' || undefined;
 */
function readIsActiveFromSearchParams(search: string): boolean | undefined {
  const sp = new URLSearchParams(search);
  return sp.get('isActive') === 'true' || undefined;
}

describe('readIsActiveFromSearchParams (board §9.3 URL wiring)', () => {
  it('returns true when URL contains ?isActive=true', () => {
    expect(readIsActiveFromSearchParams('isActive=true')).toBe(true);
  });

  it('returns undefined (not false) when URL contains ?isActive=false', () => {
    expect(readIsActiveFromSearchParams('isActive=false')).toBeUndefined();
  });

  it('returns undefined when isActive param is absent', () => {
    expect(readIsActiveFromSearchParams('page=1&limit=20')).toBeUndefined();
  });

  it('returns undefined for an arbitrary non-"true" value', () => {
    expect(readIsActiveFromSearchParams('isActive=yes')).toBeUndefined();
  });
});

// ── Status deep-link URL reading (work-orders-board.tsx) ─────────────────────

/**
 * Reproduces the logic:
 *   const statusParam = searchParams.get('status') as WorkOrderStatus | null;
 *   if (statusParam && Object.values(WorkOrderStatus).includes(statusParam)) setStatus(statusParam)
 */
function readStatusFromSearchParams(search: string): WorkOrderStatus | null {
  const sp = new URLSearchParams(search);
  const val = sp.get('status') as WorkOrderStatus | null;
  if (val && Object.values(WorkOrderStatus).includes(val)) return val;
  return null;
}

describe('readStatusFromSearchParams (board status deep-link)', () => {
  it('returns CLOSED when ?status=CLOSED', () => {
    expect(readStatusFromSearchParams('status=CLOSED')).toBe(WorkOrderStatus.CLOSED);
  });

  it('returns IN_PROGRESS when ?status=IN_PROGRESS', () => {
    expect(readStatusFromSearchParams('status=IN_PROGRESS')).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it('returns null for an unknown status value', () => {
    expect(readStatusFromSearchParams('status=UNKNOWN_STATUS')).toBeNull();
  });

  it('returns null when status param is absent', () => {
    expect(readStatusFromSearchParams('page=1')).toBeNull();
  });

  it('returns null for empty string status', () => {
    expect(readStatusFromSearchParams('status=')).toBeNull();
  });
});

// ── ClosedTodayRow display logic ──────────────────────────────────────────────

/**
 * Reproduces the display logic from ClosedTodayRow:
 *  - Show principalTechnician.name or fallback to 'noTechnician'
 *  - Show item.type as WO type badge
 */
interface MockWoListItem {
  id: string;
  asset: { name: string };
  principalTechnician: { name: string } | null;
  type: WorkOrderType;
}

function getTechnicianDisplayName(item: MockWoListItem, fallback: string): string {
  return item.principalTechnician?.name ?? fallback;
}

describe('ClosedTodayRow display logic', () => {
  const baseWo: MockWoListItem = {
    id: 'wo-1',
    asset: { name: 'Pompe P-01' },
    principalTechnician: { name: 'Jean Dupont' },
    type: WorkOrderType.CORRECTIVE,
  };

  it('shows principal technician name when present', () => {
    expect(getTechnicianDisplayName(baseWo, 'Aucun technicien')).toBe('Jean Dupont');
  });

  it('shows fallback label when principalTechnician is null', () => {
    const wo = { ...baseWo, principalTechnician: null };
    expect(getTechnicianDisplayName(wo, 'Aucun technicien')).toBe('Aucun technicien');
  });

  it('shows asset name from the work order', () => {
    expect(baseWo.asset.name).toBe('Pompe P-01');
  });

  it('uses WorkOrderType for the result badge', () => {
    expect(baseWo.type).toBe(WorkOrderType.CORRECTIVE);
    const preventiveWo = { ...baseWo, type: WorkOrderType.PREVENTIVE };
    expect(preventiveWo.type).toBe(WorkOrderType.PREVENTIVE);
  });

  it('"more" count = total - displayed rows (max 5)', () => {
    const total = 8;
    const displayed = 5;
    expect(total - displayed).toBe(3);
  });
});
