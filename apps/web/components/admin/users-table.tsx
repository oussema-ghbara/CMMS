'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Mail, Loader2 } from 'lucide-react';
import { Role } from '@gmao/shared';
import type { UserDto } from '@gmao/shared';
import { usersApi } from '@/lib/users.api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UserFormDialog } from './user-form-dialog';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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
    onError: () => {
      toast.error(t('admin.users.toasts.deactivateError'));
      setDeactivateTarget(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.reactivate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('admin.users.toasts.reactivateSuccess'));
    },
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

  const handleCreate = () => {
    setEditingUser(null);
    setDialogOpen(true);
  };

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('admin.users.filters.allRoles')}</option>
            {Object.values(Role).map((role) => (
              <option key={role} value={role}>
                {t(`admin.users.roles.${role}`, { defaultValue: role })}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('admin.users.filters.allStatuses')}</option>
            <option value="active">{t('admin.users.filters.active')}</option>
            <option value="inactive">{t('admin.users.filters.inactive')}</option>
          </select>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4" />
          {t('admin.users.actions.create')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.users.columns.name')}</TableHead>
              <TableHead>{t('admin.users.columns.email')}</TableHead>
              <TableHead>{t('admin.users.columns.roles')}</TableHead>
              <TableHead>{t('admin.users.columns.status')}</TableHead>
              <TableHead>{t('admin.users.columns.lastLogin')}</TableHead>
              <TableHead>{t('admin.users.columns.createdAt')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('admin.users.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} variant="secondary" className="text-xs">
                          {t(`admin.users.roles.${role}`, { defaultValue: role })}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'success' : 'destructive'}>
                      {user.isActive
                        ? t('admin.users.status.active')
                        : t('admin.users.status.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(user.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('common.edit')}
                        onClick={() => { void handleEdit(user); }}
                        disabled={loadingEditUserId === user.id}
                      >
                        {loadingEditUserId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Pencil className="h-4 w-4" />
                        )}
                      </Button>
                      {user.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('admin.categories.actions.deactivate')}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeactivateTarget(user)}
                          disabled={deactivateMutation.isPending}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('admin.categories.actions.activate')}
                            className="text-green-600 hover:text-green-600"
                            onClick={() => reactivateMutation.mutate(user.id)}
                            disabled={reactivateMutation.isPending}
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          {!user.lastLoginAt && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('admin.users.toasts.resendSuccess')}
                              onClick={() => resendMutation.mutate(user.id)}
                              disabled={resendMutation.isPending}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingUser(null);
        }}
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
        description={
          deactivateTarget
            ? t('admin.users.deactivateDialog.description', { name: deactivateTarget.name })
            : undefined
        }
        confirmLabel={t('admin.categories.actions.deactivate')}
        isPending={deactivateMutation.isPending}
        onConfirm={() => {
          if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id);
        }}
      />
    </div>
  );
}
