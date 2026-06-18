'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, UserCircle, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Cookies from 'js-cookie';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Role } from '@gmao/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { usersApi } from '@/lib/users.api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_COLOR: Record<string, string> = {
  SUPERVISOR: 'var(--sb-role-supervisor)',
  STOREKEEPER: 'var(--sb-role-storekeeper)',
  TECHNICIAN: 'var(--sb-role-technician)',
  VALIDATOR: 'var(--sb-role-validator)',
  ADMIN: 'var(--sb-text-secondary)',
};

const ROLE_BG: Record<string, string> = {
  SUPERVISOR: 'var(--sb-role-supervisor-bg)',
  STOREKEEPER: 'var(--sb-role-storekeeper-bg)',
  TECHNICIAN: 'var(--sb-role-technician-bg)',
  VALIDATOR: 'var(--sb-role-validator-bg)',
  ADMIN: 'var(--sb-surface)',
};

export function ProfileDropdown() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dropOpen, setDropOpen] = React.useState(false);
  const { user, activeRole, setActiveRole, clearAuth } = useAuthStore();

  const { data: prefs } = useQuery({
    queryKey: ['users', 'me', 'preferences'],
    queryFn: () => usersApi.getMyPreferences(),
    enabled: !!user,
  });

  const emailPrefMutation = useMutation({
    mutationFn: (enabled: boolean) => usersApi.updateEmailNotifications(enabled),
    onSuccess: (data) => {
      void queryClient.setQueryData(['users', 'me', 'preferences'], data);
      toast.success(t('userPreferences.emailNotifications.updateSuccess'));
    },
    onError: () => toast.error(t('userPreferences.emailNotifications.updateError')),
  });

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    finally {
      clearAuth();
      Cookies.remove('user_roles', { path: '/' });
      router.push('/login');
    }
  };

  if (!user) return null;

  const roleColor = ROLE_COLOR[activeRole ?? ''] ?? 'var(--sb-text-secondary)';

  return (
    <DropdownMenu open={dropOpen} onOpenChange={setDropOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={user.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: dropOpen ? '#2A2825' : 'transparent',
            border: `1px solid ${dropOpen ? '#3A3835' : 'transparent'}`,
            padding: '3px 8px 3px 4px',
            cursor: 'pointer',
            outline: 'none',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: '22px',
              height: '22px',
              background: roleColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '9px',
                fontWeight: '800',
                color: '#fff',
                letterSpacing: '0.04em',
              }}
            >
              {getInitials(user.name)}
            </span>
          </span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '1px',
            }}
          >
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '8px',
                fontWeight: '600',
                color: 'var(--sb-text-on-rail)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {user.name}
            </span>
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '7px',
                color: 'var(--sb-text-dim-rail)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {activeRole ?? ''}
            </span>
          </div>
          <span
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '8px',
              color: 'var(--sb-text-dim-rail)',
              marginLeft: '2px',
            }}
          >
            {dropOpen ? '▲' : '▾'}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        style={{
          width: '280px',
          borderRadius: '2px',
          border: '1px solid var(--sb-border)',
          padding: 0,
          background: '#fff',
        }}
      >

        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--sb-border)',
          }}
        >
          <p
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--sb-text-primary)',
              margin: '0 0 2px',
            }}
          >
            {user.name}
          </p>
          <p
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '10px',
              color: 'var(--sb-text-tertiary)',
              margin: 0,
            }}
          >
            {user.id}
          </p>
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--sb-border)',
          }}
        >
          <p
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '9px',
              color: 'var(--sb-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.13em',
              margin: '0 0 8px',
            }}
          >
            {t('profile.fields.roles')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {user.roles.map((role) => {
              const isActive = role === activeRole;
              const rc = ROLE_COLOR[role] ?? 'var(--sb-text-secondary)';
              const rb = ROLE_BG[role] ?? 'var(--sb-surface)';
              return (
                <div
                  key={role}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                      color: rc,
                      background: rb,
                      border: `1px solid ${rc}`,
                      borderRadius: '2px',
                      padding: '2px 6px',
                      flex: 1,
                      fontWeight: isActive ? '600' : '400',
                    }}
                  >
                    {t(`roles.${role}`)}
                    {isActive && (
                      <span style={{ marginLeft: '6px', opacity: 0.55, fontSize: '9px' }}>
                        ●
                      </span>
                    )}
                  </span>
                  {!isActive && user.roles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRole(role as Role);
                        const roleHome: Partial<Record<Role, string>> = {
                          [Role.ADMIN]: '/admin',
                          [Role.SUPERVISOR]: '/supervisor',
                          [Role.STOREKEEPER]: '/storekeeper',
                        };
                        const home = roleHome[role as Role];
                        if (home) router.push(home);
                      }}
                      style={{
                        background: 'none',
                        border: `1px solid ${rc}`,
                        borderRadius: '2px',
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                        color: rc,
                        cursor: 'pointer',
                        letterSpacing: '0.08em',
                        flexShrink: 0,
                      }}
                    >
                      {t('profile.switchRole')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '4px 0' }}>
          <Link
            href="/profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              color: 'var(--sb-text-primary)',
              textDecoration: 'none',
            }}
          >
            <UserCircle
              style={{ width: '14px', height: '14px', color: 'var(--sb-text-secondary)' }}
            />
            {t('profile.profileLink')}
          </Link>

          <button
            type="button"
            onClick={() =>
              emailPrefMutation.mutate(!(prefs?.emailNotificationsEnabled ?? true))
            }
            disabled={emailPrefMutation.isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              color: 'var(--sb-text-primary)',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: emailPrefMutation.isPending ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              opacity: emailPrefMutation.isPending ? 0.6 : 1,
            }}
          >
            <Mail
              style={{ width: '14px', height: '14px', color: 'var(--sb-text-secondary)' }}
            />
            <span style={{ flex: 1 }}>{t('userPreferences.emailNotifications.label')}</span>
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '10px',
                color: 'var(--sb-text-tertiary)',
              }}
            >
              {prefs?.emailNotificationsEnabled !== false
                ? t('userPreferences.emailNotifications.enabled')
                : t('userPreferences.emailNotifications.disabled')}
            </span>
          </button>

          <div
            style={{ height: '1px', background: 'var(--sb-border)', margin: '4px 0' }}
          />

          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              color: 'var(--sb-p-crit)',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <LogOut style={{ width: '14px', height: '14px' }} />
            {t('auth.logout')}
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
