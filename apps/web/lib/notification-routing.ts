import { Role } from '@gmao/shared';
import { type NotificationItem } from './notifications.api';

/**
 * Maps a notification's entityType + entityId to a navigable URL for the
 * current user's role (spec §2.3). Returns null when no route is applicable
 * (e.g. no entity reference, or user's role has no dedicated page for the entity).
 */
export function resolveNotificationRoute(
  notification: Pick<NotificationItem, 'entityType' | 'entityId'>,
  roles: Role[],
): string | null {
  const { entityType, entityId } = notification;
  if (!entityType || !entityId) return null;

  switch (entityType) {
    case 'WorkOrder':
      if (roles.includes(Role.SUPERVISOR)) {
        return `/supervisor/work-orders?id=${entityId}`;
      }
      return null;
    case 'ProblemReport':
      if (roles.includes(Role.SUPERVISOR)) {
        return `/supervisor/reports?id=${entityId}`;
      }
      return null;
    case 'PartRequest':
      if (roles.includes(Role.STOREKEEPER)) {
        return `/storekeeper/part-requests?id=${entityId}`;
      }
      return null;
    case 'Asset':
    case 'ComplianceCertificate':
      if (roles.includes(Role.SUPERVISOR)) {
        return `/supervisor/assets?id=${entityId}`;
      }
      return null;
    default:
      return null;
  }
}
