import { WorkOrderStatus, ChecklistItemStatus } from '@gmao/db';

export interface PreventiveWOForPlan {
  sourcePlanId: string | null;
  sourcePlan: { id: string; title: string } | null;
  status: WorkOrderStatus;
  dueDate: Date | null;
  closedAt: Date | null;
}

export interface ChecklistItemForPlanItem {
  sourcePlanItemId: string | null;
  sourcePlanItem: { id: string; description: string } | null;
  status: ChecklistItemStatus;
}

export interface PlanComplianceEntry {
  planId: string;
  planTitle: string;
  total: number;
  closedOnTime: number;
  rate: number | null;
}

export interface ChecklistItemAnomalyEntry {
  itemId: string;
  description: string;
  total: number;
  anomalyCount: number;
  rate: number | null;
}

export function computeCompliancePerPlan(wos: PreventiveWOForPlan[]): PlanComplianceEntry[] {
  const planMap = new Map<string, { planTitle: string; total: number; closedOnTime: number }>();

  for (const wo of wos) {
    if (!wo.sourcePlanId || !wo.sourcePlan) continue;
    const entry = planMap.get(wo.sourcePlanId) ?? { planTitle: wo.sourcePlan.title, total: 0, closedOnTime: 0 };
    entry.total += 1;
    if (wo.status === WorkOrderStatus.CLOSED && wo.closedAt && wo.dueDate && wo.closedAt <= wo.dueDate) {
      entry.closedOnTime += 1;
    }
    planMap.set(wo.sourcePlanId, entry);
  }

  return Array.from(planMap.entries()).map(([planId, d]) => ({
    planId,
    planTitle: d.planTitle,
    total: d.total,
    closedOnTime: d.closedOnTime,
    rate: d.total > 0 ? Math.round((d.closedOnTime / d.total) * 1000) / 1000 : null,
  }));
}

export function computeAnomalyPerChecklistItem(items: ChecklistItemForPlanItem[]): ChecklistItemAnomalyEntry[] {
  const itemMap = new Map<string, { description: string; total: number; anomalyCount: number }>();

  for (const ci of items) {
    if (!ci.sourcePlanItemId || !ci.sourcePlanItem) continue;
    const entry = itemMap.get(ci.sourcePlanItemId) ?? { description: ci.sourcePlanItem.description, total: 0, anomalyCount: 0 };
    entry.total += 1;
    if (ci.status === ChecklistItemStatus.ANOMALY_DETECTED) entry.anomalyCount += 1;
    itemMap.set(ci.sourcePlanItemId, entry);
  }

  return Array.from(itemMap.entries())
    .map(([itemId, d]) => ({
      itemId,
      description: d.description,
      total: d.total,
      anomalyCount: d.anomalyCount,
      rate: d.total > 0 ? Math.round((d.anomalyCount / d.total) * 1000) / 1000 : null,
    }))
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
}
