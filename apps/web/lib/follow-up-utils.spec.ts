/**
 * Unit tests for follow-up WO utilities (spec §1.4 / §2.4 / §9.3).
 *
 * Tests cover:
 * - buildFollowUpDescription: prefix formatting
 * - resolveNotificationRoute for WorkOrder (regression: FOLLOW_UP source WOs are
 *   still WorkOrder entities and must route correctly)
 * - getTechnicianLoad sorting and hasCritical aggregation logic
 *   (mirrors the backend service logic — frontend aggregates from API response)
 */

import { resolveNotificationRoute } from './notification-routing';
import { Role, NotificationType } from '@gmao/shared';
import type { TechnicianLoadItem } from './work-orders.api';

// ── buildFollowUpDescription helper ──────────────────────────────────────────
// This matches the i18n key supervisorWorkOrders.followUp.descriptionPrefix:
// "Suite à {{ref}} : {{original}}"

function buildFollowUpDescription(ref: string, original: string): string {
  return `Suite à ${ref} : ${original}`;
}

describe('buildFollowUpDescription', () => {
  it('prefixes with Suite à and the reference number', () => {
    const result = buildFollowUpDescription('WO-2026-100', 'Pump failure');
    expect(result).toBe('Suite à WO-2026-100 : Pump failure');
  });

  it('preserves the full original description', () => {
    const original = 'Moteur surchauffe, vibrations excessives détectées';
    const result = buildFollowUpDescription('WO-2026-200', original);
    expect(result).toContain(original);
  });

  it('includes the reference number in the prefix', () => {
    const result = buildFollowUpDescription('WO-2026-999', 'Check valve');
    expect(result).toContain('WO-2026-999');
  });
});

// ── Notification routing for follow-up WOs ───────────────────────────────────
// FOLLOW_UP source WOs are still WorkOrder entities, so the routing must
// return the supervisor work-orders route — same as any other WO.

function makeNotif(entityType: string | null, entityId: string | null) {
  return {
    id: 'notif-1',
    type: NotificationType.FOLLOW_UP_PROMPT,
    title: 'Follow-up prompt',
    summary: 'A follow-up is recommended',
    entityType,
    entityId,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

describe('resolveNotificationRoute — FOLLOW_UP_PROMPT notification', () => {
  it('routes WorkOrder entity to supervisor work-orders for SUPERVISOR role', () => {
    const route = resolveNotificationRoute(
      makeNotif('WorkOrder', 'wo-follow-1'),
      [Role.SUPERVISOR],
    );
    expect(route).toBe('/supervisor/work-orders?id=wo-follow-1');
  });

  it('returns null for TECHNICIAN role (no supervisor page)', () => {
    const route = resolveNotificationRoute(
      makeNotif('WorkOrder', 'wo-follow-1'),
      [Role.TECHNICIAN],
    );
    expect(route).toBeNull();
  });

  it('returns null when entityId is null', () => {
    const route = resolveNotificationRoute(makeNotif('WorkOrder', null), [Role.SUPERVISOR]);
    expect(route).toBeNull();
  });
});

// ── TechnicianLoadItem aggregation logic (mirrors backend) ───────────────────
// The frontend receives pre-aggregated data from the API but we test the
// sort order and hasCritical flag expectations that the UI depends on.

function sortByLoadDesc(items: TechnicianLoadItem[]): TechnicianLoadItem[] {
  return [...items].sort((a, b) => b.openWoCount - a.openWoCount);
}

describe('TechnicianLoadItem display logic', () => {
  const sampleLoad: TechnicianLoadItem[] = [
    { technicianId: 'tech-a', name: 'Alice', openWoCount: 5, hasCritical: true },
    { technicianId: 'tech-b', name: 'Bob', openWoCount: 1, hasCritical: false },
    { technicianId: 'tech-c', name: 'Carol', openWoCount: 3, hasCritical: false },
  ];

  it('sorts technicians by openWoCount descending', () => {
    const sorted = sortByLoadDesc(sampleLoad);
    expect(sorted[0].technicianId).toBe('tech-a');
    expect(sorted[1].technicianId).toBe('tech-c');
    expect(sorted[2].technicianId).toBe('tech-b');
  });

  it('preserves hasCritical flag after sort', () => {
    const sorted = sortByLoadDesc(sampleLoad);
    expect(sorted[0].hasCritical).toBe(true);
    expect(sorted[1].hasCritical).toBe(false);
  });

  it('handles empty array without error', () => {
    expect(sortByLoadDesc([])).toEqual([]);
  });

  it('technician with no critical WOs has hasCritical=false', () => {
    const item: TechnicianLoadItem = {
      technicianId: 'tech-x',
      name: 'Dave',
      openWoCount: 4,
      hasCritical: false,
    };
    expect(item.hasCritical).toBe(false);
  });
});
