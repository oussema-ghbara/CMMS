import { Role } from '@gmao/shared';
import { type NotificationItem } from './notifications.api';

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
