import { NotificationType } from '@gmao/shared';
import { api } from './api';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
}

export const notificationsApi = {
  list: (params?: NotificationListQuery) =>
    api.get<NotificationListResponse>('/notifications', { params }).then((r) => r.data),

  unreadCount: () =>
    api.get<{ unreadCount: number }>('/notifications/count/unread').then((r) => r.data),

  markAsRead: (id: string) =>
    api.patch<{ success: true }>(`/notifications/${id}/read`).then((r) => r.data),

  markAllAsRead: () =>
    api.patch<{ updated: number }>('/notifications/mark-all-read').then((r) => r.data),
};
