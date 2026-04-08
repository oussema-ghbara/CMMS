import { create } from 'zustand';
import { notificationsApi, type NotificationItem } from '@/lib/notifications.api';

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  isUpdating: boolean;
  fetchNotifications: (params?: { page?: number; limit?: number }) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isUpdating: false,

  fetchNotifications: async (params) => {
    set({ isLoading: true });
    try {
      const response = await notificationsApi.list(params);
      set({
        notifications: response.data,
        unreadCount: response.unreadCount,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshUnreadCount: async () => {
    const response = await notificationsApi.unreadCount();
    set({ unreadCount: response.unreadCount });
  },

  markAsRead: async (id) => {
    const state = get();
    const target = state.notifications.find((notification) => notification.id === id);

    if (!target || target.isRead) {
      return;
    }

    set({
      notifications: state.notifications.map((notification) =>
        notification.id === id
          ? { ...notification, isRead: true, readAt: new Date().toISOString() }
          : notification,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
      isUpdating: true,
    });

    try {
      await notificationsApi.markAsRead(id);
    } catch {
      await get().fetchNotifications({ page: 1, limit: 20 });
    } finally {
      set({ isUpdating: false });
    }
  },

  markAllAsRead: async () => {
    const state = get();
    const hadUnread = state.notifications.some((notification) => !notification.isRead);

    if (!hadUnread) {
      return;
    }

    set({
      notifications: state.notifications.map((notification) =>
        notification.isRead
          ? notification
          : { ...notification, isRead: true, readAt: new Date().toISOString() },
      ),
      unreadCount: 0,
      isUpdating: true,
    });

    try {
      await notificationsApi.markAllAsRead();
    } catch {
      await get().fetchNotifications({ page: 1, limit: 20 });
    } finally {
      set({ isUpdating: false });
    }
  },
}));
