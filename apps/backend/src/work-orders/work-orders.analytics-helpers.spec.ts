/**
 * Unit tests for §1.3 per-plan compliance rate and per-checklist-item anomaly rate
 * helpers used by WorkOrdersService.getAnalytics().
 */

import { WorkOrderStatus, ChecklistItemStatus } from '@gmao/db';
import {
  computeCompliancePerPlan,
  computeAnomalyPerChecklistItem,
  type PreventiveWOForPlan,
  type ChecklistItemForPlanItem,
} from './work-orders.analytics-helpers';

const plan1 = { id: 'plan-1', title: 'Révision mensuelle' };
const plan2 = { id: 'plan-2', title: 'Inspection trimestrielle' };
const item1 = { id: 'item-1', description: 'Vérifier niveau huile' };
const item2 = { id: 'item-2', description: 'Contrôle serrage boulons' };

const due = new Date('2026-04-01T00:00:00Z');
const closedOnTime = new Date('2026-03-30T00:00:00Z');
const closedLate = new Date('2026-04-05T00:00:00Z');

function makeWO(overrides: Partial<PreventiveWOForPlan> = {}): PreventiveWOForPlan {
  return {
    sourcePlanId: plan1.id,
    sourcePlan: plan1,
    status: WorkOrderStatus.CLOSED,
    dueDate: due,
    closedAt: closedOnTime,
    ...overrides,
  };
}

function makeCI(overrides: Partial<ChecklistItemForPlanItem> = {}): ChecklistItemForPlanItem {
  return {
    sourcePlanItemId: item1.id,
    sourcePlanItem: item1,
    status: ChecklistItemStatus.DONE,
    ...overrides,
  };
}

// ── computeCompliancePerPlan ───────────────────────────────────────────────────

describe('computeCompliancePerPlan', () => {
  it('returns empty array when input is empty', () => {
    expect(computeCompliancePerPlan([])).toEqual([]);
  });

  it('skips WOs without a sourcePlanId', () => {
    const result = computeCompliancePerPlan([makeWO({ sourcePlanId: null, sourcePlan: null })]);
    expect(result).toHaveLength(0);
  });

  it('counts a CLOSED WO with closedAt <= dueDate as compliant', () => {
    const [row] = computeCompliancePerPlan([makeWO()]);
    expect(row.total).toBe(1);
    expect(row.closedOnTime).toBe(1);
    expect(row.rate).toBe(1);
  });

  it('counts a CLOSED WO with closedAt > dueDate as non-compliant', () => {
    const [row] = computeCompliancePerPlan([makeWO({ closedAt: closedLate })]);
    expect(row.total).toBe(1);
    expect(row.closedOnTime).toBe(0);
    expect(row.rate).toBe(0);
  });

  it('counts a non-CLOSED WO (e.g. ASSIGNED) as non-compliant regardless of dates', () => {
    const [row] = computeCompliancePerPlan([makeWO({ status: WorkOrderStatus.ASSIGNED })]);
    expect(row.closedOnTime).toBe(0);
  });

  it('counts a CLOSED WO with no dueDate as non-compliant', () => {
    const [row] = computeCompliancePerPlan([makeWO({ dueDate: null })]);
    expect(row.closedOnTime).toBe(0);
  });

  it('counts a CLOSED WO with no closedAt as non-compliant', () => {
    const [row] = computeCompliancePerPlan([makeWO({ closedAt: null })]);
    expect(row.closedOnTime).toBe(0);
  });

  it('aggregates multiple WOs per plan correctly', () => {
    const wos: PreventiveWOForPlan[] = [
      makeWO({ closedAt: closedOnTime }),
      makeWO({ closedAt: closedOnTime }),
      makeWO({ closedAt: closedLate }),
    ];
    const [row] = computeCompliancePerPlan(wos);
    expect(row.total).toBe(3);
    expect(row.closedOnTime).toBe(2);
    expect(row.rate).toBeCloseTo(0.667, 2);
  });

  it('produces separate entries for distinct plans', () => {
    const wos: PreventiveWOForPlan[] = [
      makeWO({ sourcePlanId: plan1.id, sourcePlan: plan1 }),
      makeWO({ sourcePlanId: plan2.id, sourcePlan: plan2, closedAt: closedLate }),
    ];
    const result = computeCompliancePerPlan(wos);
    expect(result).toHaveLength(2);
    const r1 = result.find((r) => r.planId === plan1.id)!;
    const r2 = result.find((r) => r.planId === plan2.id)!;
    expect(r1.rate).toBe(1);
    expect(r2.rate).toBe(0);
  });

  it('sets rate to null when total is 0 (unreachable but guarded)', () => {
    const result = computeCompliancePerPlan([makeWO({ sourcePlanId: null, sourcePlan: null })]);
    expect(result).toHaveLength(0);
  });

  it('preserves planTitle in the output', () => {
    const [row] = computeCompliancePerPlan([makeWO()]);
    expect(row.planTitle).toBe(plan1.title);
  });
});

// ── computeAnomalyPerChecklistItem ────────────────────────────────────────────

describe('computeAnomalyPerChecklistItem', () => {
  it('returns empty array when input is empty', () => {
    expect(computeAnomalyPerChecklistItem([])).toEqual([]);
  });

  it('skips items without a sourcePlanItemId', () => {
    const result = computeAnomalyPerChecklistItem([makeCI({ sourcePlanItemId: null, sourcePlanItem: null })]);
    expect(result).toHaveLength(0);
  });

  it('counts ANOMALY_DETECTED status items correctly', () => {
    const items: ChecklistItemForPlanItem[] = [
      makeCI({ status: ChecklistItemStatus.DONE }),
      makeCI({ status: ChecklistItemStatus.ANOMALY_DETECTED }),
      makeCI({ status: ChecklistItemStatus.ANOMALY_DETECTED }),
    ];
    const [row] = computeAnomalyPerChecklistItem(items);
    expect(row.total).toBe(3);
    expect(row.anomalyCount).toBe(2);
    expect(row.rate).toBeCloseTo(0.667, 2);
  });

  it('sets anomalyCount to 0 when all items are DONE', () => {
    const [row] = computeAnomalyPerChecklistItem([makeCI(), makeCI(), makeCI()]);
    expect(row.anomalyCount).toBe(0);
    expect(row.rate).toBe(0);
  });

  it('groups by sourcePlanItemId and produces separate entries', () => {
    const items: ChecklistItemForPlanItem[] = [
      makeCI({ sourcePlanItemId: item1.id, sourcePlanItem: item1, status: ChecklistItemStatus.ANOMALY_DETECTED }),
      makeCI({ sourcePlanItemId: item2.id, sourcePlanItem: item2, status: ChecklistItemStatus.DONE }),
    ];
    const result = computeAnomalyPerChecklistItem(items);
    expect(result).toHaveLength(2);
    const r1 = result.find((r) => r.itemId === item1.id)!;
    const r2 = result.find((r) => r.itemId === item2.id)!;
    expect(r1.rate).toBe(1);
    expect(r2.rate).toBe(0);
  });

  it('sorts results by rate descending', () => {
    const items: ChecklistItemForPlanItem[] = [
      makeCI({ sourcePlanItemId: item1.id, sourcePlanItem: item1, status: ChecklistItemStatus.DONE }),
      makeCI({ sourcePlanItemId: item2.id, sourcePlanItem: item2, status: ChecklistItemStatus.ANOMALY_DETECTED }),
    ];
    const result = computeAnomalyPerChecklistItem(items);
    expect(result[0].itemId).toBe(item2.id);
    expect(result[1].itemId).toBe(item1.id);
  });

  it('preserves description in output', () => {
    const [row] = computeAnomalyPerChecklistItem([makeCI()]);
    expect(row.description).toBe(item1.description);
  });

  it('rate rounds to 3 decimal places', () => {
    const items: ChecklistItemForPlanItem[] = [
      makeCI({ status: ChecklistItemStatus.ANOMALY_DETECTED }),
      makeCI({ status: ChecklistItemStatus.DONE }),
      makeCI({ status: ChecklistItemStatus.DONE }),
    ];
    const [row] = computeAnomalyPerChecklistItem(items);
    expect(row.rate).toBe(0.333);
  });
});
