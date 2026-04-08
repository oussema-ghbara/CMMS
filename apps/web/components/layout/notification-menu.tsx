'use client';

import * as React from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationsStore } from '@/store/notifications.store';
import { NotificationBadge } from './notification-badge';

export function NotificationMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    isUpdating,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationsStore();

  React.useEffect(() => {
    void fetchNotifications({ page: 1, limit: 20 });

    const intervalId = window.setInterval(() => {
      void fetchNotifications({ page: 1, limit: 20 });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [fetchNotifications]);

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void fetchNotifications({ page: 1, limit: 20 });
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('notifications.title')}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          <NotificationBadge count={unreadCount} isLoading={isLoading} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t('notifications.title')}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={unreadCount <= 0 || isUpdating}
            onClick={() => {
              void markAllAsRead();
            }}
          >
            {t('notifications.markAllRead')}
          </Button>
        </div>

        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('common.loading')}</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('notifications.noNotifications')}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className="flex w-full flex-col gap-1 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50"
                onClick={() => {
                  if (!notification.isRead) {
                    void markAsRead(notification.id);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-tight">{notification.title}</p>
                  {!notification.isRead ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{notification.summary}</p>
                <p className="text-[11px] text-muted-foreground/90">
                  {new Intl.DateTimeFormat(i18n.language || 'fr', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(notification.createdAt))}
                </p>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
