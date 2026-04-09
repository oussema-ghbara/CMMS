'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Administrateur',
  [Role.SUPERVISOR]: 'Superviseur',
  [Role.TECHNICIAN]: 'Technicien',
  [Role.STOREKEEPER]: 'Magasinier',
  [Role.REQUESTER]: 'Demandeur',
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function UsersTable() {
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
      toast.success('Utilisateur désactivé');
      setDeactivateTarget(null);
    },
    onError: () => {
      toast.error('Erreur lors de la désactivation');
      setDeactivateTarget(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.reactivate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur réactivé');
    },
    onError: () => toast.error('Erreur lors de la réactivation'),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => usersApi.resendSetup(id),
    onSuccess: () => toast.success('Email de configuration renvoyé'),
    onError: () => toast.error("Erreur lors de l'envoi"),
  });

  const handleEdit = async (user: UserDto) => {
    setLoadingEditUserId(user.id);
    try {
      const freshUser = await usersApi.getOne(user.id);
      setEditingUser(freshUser);
      setDialogOpen(true);
    } catch {
      toast.error('Erreur lors du chargement du profil utilisateur');
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
            <option value="">Tous les rôles</option>
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4" />
          Nouvel utilisateur
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôles</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead>Créé le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                  Aucun utilisateur trouvé
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
                          {ROLE_LABELS[role] ?? role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'success' : 'destructive'}>
                      {user.isActive ? 'Actif' : 'Inactif'}
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
                        title="Modifier"
                        onClick={() => {
                          void handleEdit(user);
                        }}
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
                          title="Désactiver"
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
                            title="Réactiver"
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
                              title="Renvoyer l'email de configuration"
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
        title="Désactiver l'utilisateur"
        description={
          deactivateTarget
            ? `Désactiver « ${deactivateTarget.name} » ? Cette action révoquera toutes ses sessions actives.`
            : undefined
        }
        confirmLabel="Désactiver"
        isPending={deactivateMutation.isPending}
        onConfirm={() => {
          if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id);
        }}
      />
    </div>
  );
}
