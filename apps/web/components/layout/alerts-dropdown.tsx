'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationsStore } from '@/store/notifications.store';
import { useAuthStore } from '@/store/auth.store';
import { useSocket } from '@/hooks/use-socket';
import { resolveNotificationRoute } from '@/lib/notification-routing';

export function AlertsDropdown() {
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
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const { socket } = useSocket();

  React.useEffect(() => {
    void fetchNotifications({ page: 1, limit: 20 });
    const id = window.setInterval(() => void fetchNotifications({ page: 1, limit: 20 }), 60_000);
    return () => window.clearInterval(id);
  }, [fetchNotifications]);

  React.useEffect(() => {
    if (!socket) return;
    const handler = () => void fetchNotifications({ page: 1, limit: 20 });
    socket.on('notification', handler);
    return () => {
      socket.off('notification', handler);
    };
  }, [socket, fetchNotifications]);

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) void fetchNotifications({ page: 1, limit: 20 });
  };

  const countLabel = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'none',
            border: '1px solid #2E2C28',
            cursor: 'pointer',
            padding: '2px 7px',
            outline: 'none',
          }}
          aria-label={t('notifications.title')}
        >
          <span
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '8px',
              fontWeight: '600',
              color: countLabel !== null ? 'var(--sb-text-on-rail)' : 'var(--sb-text-dim-rail)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}
          >
            ALERTES
          </span>
          {countLabel !== null && (
            <span
              style={{
                background: 'var(--sb-p-crit)',
                color: '#fff',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '7px',
                fontWeight: '700',
                padding: '0 4px',
                minWidth: '14px',
                height: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {countLabel}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        style={{
          width: '384px',
          maxWidth: 'calc(100vw - 2rem)',
          padding: 0,
          borderRadius: '2px',
          border: '1px solid var(--sb-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--sb-border)',
            padding: '8px 12px',
          }}
        >
          <span
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--sb-text-primary)',
            }}
          >
            {t('notifications.title')}
          </span>
          <button
            type="button"
            disabled={unreadCount <= 0 || isUpdating}
            onClick={() => void markAllAsRead()}
            style={{
              background: 'none',
              border: '1px solid var(--sb-border)',
              borderRadius: '2px',
              padding: '3px 8px',
              fontSize: '11px',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              color: 'var(--sb-text-secondary)',
              cursor: unreadCount <= 0 || isUpdating ? 'not-allowed' : 'pointer',
              opacity: unreadCount <= 0 || isUpdating ? 0.45 : 1,
            }}
          >
            {t('notifications.markAllRead')}
          </button>
        </div>

        {isLoading && notifications.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '32px 16px',
              color: 'var(--sb-text-secondary)',
              fontSize: '12px',
            }}
          >
            <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" />
            <span>{t('common.loading')}</span>
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--sb-text-secondary)',
              fontSize: '12px',
            }}
          >
            {t('notifications.noNotifications')}
          </div>
        ) : (
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.map((notification) => {
              const route = resolveNotificationRoute(notification, user?.roles ?? []);
              return (
                <button
                  key={notification.id}
                  type="button"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    width: '100%',
                    borderBottom: '1px solid var(--sb-border)',
                    padding: '10px 12px',
                    textAlign: 'left',
                    background: notification.isRead ? 'none' : 'var(--sb-surface)',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'background 120ms',
                  }}
                  onClick={() => {
                    if (!notification.isRead) void markAsRead(notification.id);
                    if (route) {
                      setOpen(false);
                      router.push(route);
                    }
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '13px',
                        fontWeight: '500',
                        color: 'var(--sb-text-primary)',
                        margin: 0,
                        lineHeight: '1.4',
                      }}
                    >
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <span
                        style={{
                          marginTop: '3px',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: 'var(--sb-p-crit)',
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p
                    style={{ fontSize: '12px', color: 'var(--sb-text-secondary)', margin: 0 }}
                  >
                    {notification.summary}
                  </p>
                  <p
                    style={{
                      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                      fontSize: '10px',
                      color: 'var(--sb-text-tertiary)',
                      margin: 0,
                    }}
                  >
                    {new Intl.DateTimeFormat(i18n.language || 'fr', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(notification.createdAt))}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
