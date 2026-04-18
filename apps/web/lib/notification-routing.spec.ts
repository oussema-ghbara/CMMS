/**
 * Unit tests for resolveNotificationRoute (spec §2.3)
 *
 * Covers:
 * - Returns null when entityType is null
 * - Returns null when entityId is null
 * - WorkOrder → supervisor route for SUPERVISOR role
 * - WorkOrder → null when user has no SUPERVISOR role
 * - ProblemReport → supervisor reports route for SUPERVISOR role
 * - ProblemReport → null for non-supervisor
 * - PartRequest → storekeeper route for STOREKEEPER role
 * - PartRequest → null for non-storekeeper
 * - Asset → supervisor assets route for SUPERVISOR role
 * - ComplianceCertificate → supervisor assets route for SUPERVISOR role
 * - Unknown entityType → null
 * - Empty roles array → null for all entity types
 * - Routes include entityId as ?id= query param
 */

import { resolveNotificationRoute } from './notification-routing';
import { Role } from '@gmao/shared';
import { NotificationType } from '@gmao/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(entityType: string | null, entityId: string | null) {
  return {
    id: 'notif-1',
    type: NotificationType.WO_ASSIGNED,
    title: 'Test',
    summary: 'Test summary',
    entityType,
    entityId,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveNotificationRoute', () => {
  describe('null / missing entity fields', () => {
    it('returns null when entityType is null', () => {
      expect(resolveNotificationRoute(n(null, 'some-id'), [Role.SUPERVISOR])).toBeNull();
    });

    it('returns null when entityId is null', () => {
      expect(resolveNotificationRoute(n('WorkOrder', null), [Role.SUPERVISOR])).toBeNull();
    });

    it('returns null when both are null', () => {
      expect(resolveNotificationRoute(n(null, null), [Role.SUPERVISOR])).toBeNull();
    });

    it('returns null when roles array is empty', () => {
      expect(resolveNotificationRoute(n('WorkOrder', 'wo-1'), [])).toBeNull();
    });
  });

  describe('WorkOrder entity', () => {
    it('returns supervisor work-orders route for SUPERVISOR role', () => {
      const route = resolveNotificationRoute(n('WorkOrder', 'wo-abc'), [Role.SUPERVISOR]);
      expect(route).toBe('/supervisor/work-orders?id=wo-abc');
    });

    it('includes the entityId in the query param', () => {
      const route = resolveNotificationRoute(n('WorkOrder', 'my-wo-id'), [Role.SUPERVISOR]);
      expect(route).toContain('id=my-wo-id');
    });

    it('returns null for STOREKEEPER role on WorkOrder', () => {
      expect(resolveNotificationRoute(n('WorkOrder', 'wo-1'), [Role.STOREKEEPER])).toBeNull();
    });

    it('returns null for ADMIN role on WorkOrder', () => {
      expect(resolveNotificationRoute(n('WorkOrder', 'wo-1'), [Role.ADMIN])).toBeNull();
    });

    it('returns route when user has multiple roles including SUPERVISOR', () => {
      const route = resolveNotificationRoute(n('WorkOrder', 'wo-1'), [Role.ADMIN, Role.SUPERVISOR]);
      expect(route).toBe('/supervisor/work-orders?id=wo-1');
    });
  });

  describe('ProblemReport entity', () => {
    it('returns supervisor reports route for SUPERVISOR role', () => {
      const route = resolveNotificationRoute(n('ProblemReport', 'rep-1'), [Role.SUPERVISOR]);
      expect(route).toBe('/supervisor/reports?id=rep-1');
    });

    it('returns null for REQUESTER role on ProblemReport', () => {
      expect(resolveNotificationRoute(n('ProblemReport', 'rep-1'), [Role.REQUESTER])).toBeNull();
    });
  });

  describe('PartRequest entity', () => {
    it('returns storekeeper part-requests route for STOREKEEPER role', () => {
      const route = resolveNotificationRoute(n('PartRequest', 'pr-1'), [Role.STOREKEEPER]);
      expect(route).toBe('/storekeeper/part-requests?id=pr-1');
    });

    it('returns null for SUPERVISOR role on PartRequest', () => {
      expect(resolveNotificationRoute(n('PartRequest', 'pr-1'), [Role.SUPERVISOR])).toBeNull();
    });
  });

  describe('Asset entity', () => {
    it('returns supervisor assets route for SUPERVISOR role', () => {
      const route = resolveNotificationRoute(n('Asset', 'asset-1'), [Role.SUPERVISOR]);
      expect(route).toBe('/supervisor/assets?id=asset-1');
    });

    it('returns null for non-supervisor on Asset', () => {
      expect(resolveNotificationRoute(n('Asset', 'asset-1'), [Role.TECHNICIAN])).toBeNull();
    });
  });

  describe('ComplianceCertificate entity', () => {
    it('returns supervisor assets route (certificate is on an asset) for SUPERVISOR role', () => {
      const route = resolveNotificationRoute(n('ComplianceCertificate', 'cert-1'), [Role.SUPERVISOR]);
      expect(route).toBe('/supervisor/assets?id=cert-1');
    });
  });

  describe('Unknown entity type', () => {
    it('returns null for an unrecognized entity type', () => {
      expect(resolveNotificationRoute(n('SomeFutureEntity', 'id-1'), [Role.SUPERVISOR])).toBeNull();
    });
  });
});
