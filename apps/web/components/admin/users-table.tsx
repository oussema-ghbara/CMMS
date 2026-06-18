'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Role } from '@gmao/shared';
import type { UserDto } from '@gmao/shared';
import { usersApi } from '@/lib/users.api';
import { Mono } from '@/components/ui/mono';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { UserFormDialog } from './user-form-dialog';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const ROLE_COLOR: Record<Role, { color: string; bg: string }> = {
  [Role.SUPERVISOR]:  { color: 'var(--sb-role-supervisor)',  bg: 'var(--sb-role-supervisor-bg)' },
  [Role.STOREKEEPER]: { color: 'var(--sb-role-storekeeper)', bg: 'var(--sb-role-storekeeper-bg)' },
  [Role.TECHNICIAN]:  { color: 'var(--sb-role-technician)',  bg: 'var(--sb-role-technician-bg)' },
  [Role.ADMIN]:       { color: 'var(--sb-role-supervisor)',  bg: 'var(--sb-role-supervisor-bg)' },
  [Role.REQUESTER]:   { color: 'var(--sb-role-validator)',   bg: 'var(--sb-role-validator-bg)' },
};

const filterSelectStyle: React.CSSProperties = {
  height: 26,
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  padding: '0 4px 0 8px',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.08em',
  color: 'var(--sb-text-secondary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
};

function RolePill({ role, label }: { role: Role; label: string }) {
  const { color, bg } = ROLE_COLOR[role] ?? { color: 'var(--sb-text-secondary)', bg: 'var(--sb-surface)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', background: bg, border: `1px solid ${color}28`, borderRadius: 2, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      <Mono size={9} color={color} tracking="0.10em">{label.toUpperCase()}</Mono>
    </span>
  );
}

function ActivePill({ isActive, labelActive, labelInactive }: { isActive: boolean; labelActive: string; labelInactive: string }) {
  const color = isActive ? 'var(--sb-s-done)' : 'var(--sb-p-crit)';
  const bg    = isActive ? 'var(--sb-s-done-bg)' : 'var(--sb-p-crit-bg)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, border: `1px solid ${color}28`, borderRadius: 2, padding: '2px 7px 2px 5px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      <Mono size={9} color={color} tracking="0.10em">{isActive ? labelActive.toUpperCase() : labelInactive.toUpperCase()}</Mono>
    </span>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function RowBtn({ onClick, disabled, children, destructive }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: `1px solid ${destructive ? 'rgba(181,53,37,0.35)' : 'var(--sb-border)'}`,
        borderRadius: 2,
        padding: '3px 8px',
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: destructive ? 'var(--sb-p-crit)' : 'var(--sb-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

const GRID = '1fr 1fr 180px 100px 100px 100px 120px';

export function UsersTable() {
  const { t } = useTranslation();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [loadingEditUserId, setLoadingEditUserId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserDto | null>(null);

  const queryClient = useQueryClient();

  const queryParams: { role?: string; isActive?: boolean } = {};
  if (roleFilter) queryParams.role = roleFilter;
  if (statusFilter !== '') queryParams.isActive = statusFilter === 'active';

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => usersApi.list(queryParams),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('admin.users.toasts.deactivateSuccess'));
      setDeactivateTarget(null);
    },
    onError: () => { toast.error(t('admin.users.toasts.deactivateError')); setDeactivateTarget(null); },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.reactivate(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success(t('admin.users.toasts.reactivateSuccess')); },
    onError: () => toast.error(t('admin.users.toasts.reactivateError')),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => usersApi.resendSetup(id),
    onSuccess: () => toast.success(t('admin.users.toasts.resendSuccess')),
    onError: () => toast.error(t('admin.users.toasts.resendError')),
  });

  const handleEdit = async (user: UserDto) => {
    setLoadingEditUserId(user.id);
    try {
      const freshUser = await usersApi.getOne(user.id);
      setEditingUser(freshUser);
      setDialogOpen(true);
    } catch {
      toast.error(t('admin.users.toasts.deactivateError'));
    } finally {
      setLoadingEditUserId(null);
    }
  };

  const headers = [
    t('admin.users.columns.name'),
    t('admin.users.columns.email'),
    t('admin.users.columns.roles'),
    t('admin.users.columns.status'),
    t('admin.users.columns.lastLogin'),
    t('admin.users.columns.createdAt'),
    t('common.actions'),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div
        style={{
          minHeight: 44,
          borderBottom: '1px solid var(--sb-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          flexWrap: 'wrap',
          background: 'var(--sb-surface)',
          flexShrink: 0,
        }}
      >
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('admin.users.filters.allRoles')}</option>
          {Object.values(Role).map((role) => (
            <option key={role} value={role}>{t(`admin.users.roles.${role}`, { defaultValue: role })}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('admin.users.filters.allStatuses')}</option>
          <option value="active">{t('admin.users.filters.active')}</option>
          <option value="inactive">{t('admin.users.filters.inactive')}</option>
        </select>

        <div style={{ flex: 1 }} />

        {!isLoading && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {users.length} {t('admin.users.columns.name', { count: users.length }).toUpperCase()}
          </Mono>
        )}

        <button
          type="button"
          onClick={() => { setEditingUser(null); setDialogOpen(true); }}
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: 'var(--sb-bg)',
            background: 'var(--sb-text-primary)',
            border: 'none',
            borderRadius: 2,
            padding: '6px 14px',
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          + {t('admin.users.actions.create')}
        </button>
      </div>

      {!isLoading && users.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            padding: '0 16px',
            height: 28,
            alignItems: 'center',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          {headers.map((col, i) => (
            <Mono key={i} size={8} tracking="0.13em">{col.toUpperCase()}</Mono>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : users.length === 0 ? (
          <TableEmpty label={t('admin.users.states.empty')} />
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                padding: '0 16px',
                alignItems: 'center',
                minHeight: 44,
                borderBottom: '1px solid var(--sb-border)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {user.email}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingRight: 8 }}>
                {user.roles.map((role) => (
                  <RolePill key={role} role={role} label={t(`admin.users.roles.${role}`, { defaultValue: role })} />
                ))}
              </div>
              <div>
                <ActivePill
                  isActive={user.isActive}
                  labelActive={t('admin.users.status.active')}
                  labelInactive={t('admin.users.status.inactive')}
                />
              </div>
              <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.08em">{formatDate(user.lastLoginAt)}</Mono>
              <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.08em">{formatDate(user.createdAt)}</Mono>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <RowBtn
                  onClick={() => { void handleEdit(user); }}
                  disabled={loadingEditUserId === user.id}
                >
                  {loadingEditUserId === user.id
                    ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} />
                    : t('common.edit')}
                </RowBtn>
                {user.isActive ? (
                  <RowBtn
                    onClick={() => setDeactivateTarget(user)}
                    disabled={deactivateMutation.isPending}
                    destructive
                  >
                    {t('admin.users.actions.deactivate')}
                  </RowBtn>
                ) : (
                  <>
                    <RowBtn
                      onClick={() => reactivateMutation.mutate(user.id)}
                      disabled={reactivateMutation.isPending}
                    >
                      {t('admin.users.actions.activate')}
                    </RowBtn>
                    {!user.lastLoginAt && (
                      <RowBtn
                        onClick={() => resendMutation.mutate(user.id)}
                        disabled={resendMutation.isPending}
                      >
                        {t('admin.users.actions.resendSetup')}
                      </RowBtn>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingUser(null); }}
        user={editingUser}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['users'] });
          setDialogOpen(false);
          setEditingUser(null);
        }}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
        title={t('admin.users.deactivateDialog.title')}
        description={deactivateTarget ? t('admin.users.deactivateDialog.description', { name: deactivateTarget.name }) : undefined}
        confirmLabel={t('admin.users.actions.deactivate')}
        isPending={deactivateMutation.isPending}
        onConfirm={() => { if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id); }}
      />
    </div>
  );
}
