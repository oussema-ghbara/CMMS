'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, MapPin, Pencil, Trash2, Plus, Settings2 } from 'lucide-react';
import { locationsApi, type LocationItem, type LevelNameItem } from '@/lib/locations.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LocationFormDialog } from './location-form-dialog';

const SUPPORTED_LEVELS = [1, 2, 3, 4, 5] as const;

function LevelNamesCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({});

  const { data: levelNames = [], isLoading } = useQuery({
    queryKey: ['admin', 'locations', 'level-names'],
    queryFn: () => locationsApi.getLevelNames(),
  });

  const saveMutation = useMutation({
    mutationFn: (items: LevelNameItem[]) => locationsApi.setLevelNames(items),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'locations', 'level-names'], updated);
      toast.success(t('admin.locations.levelNames.toasts.saveSuccess'));
      setEditing(false);
    },
    onError: () => toast.error(t('admin.locations.levelNames.toasts.saveError')),
  });

  const nameForLevel = (level: number): string => {
    return levelNames.find((n) => n.level === level)?.name ?? `Niveau ${level}`;
  };

  const handleEdit = () => {
    const initial: Record<number, string> = {};
    for (const level of SUPPORTED_LEVELS) {
      initial[level] = nameForLevel(level);
    }
    setDraft(initial);
    setEditing(true);
  };

  const handleSave = () => {
    const items: LevelNameItem[] = SUPPORTED_LEVELS.map((level) => ({
      level,
      name: (draft[level] ?? nameForLevel(level)).trim() || nameForLevel(level),
    }));
    saveMutation.mutate(items);
  };

  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{t('admin.locations.levelNames.title')}</span>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={handleEdit} disabled={isLoading}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {t('common.edit')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('admin.locations.levelNames.subtitle')}</p>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : editing ? (
        <div className="space-y-2">
          {SUPPORTED_LEVELS.map((level) => (
            <div key={level} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0">
                {t('admin.locations.levelNames.levelLabel', { level })}
              </span>
              <Input
                value={draft[level] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [level]: e.target.value }))}
                maxLength={50}
                className="h-7 text-sm"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {t('common.save')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_LEVELS.map((level) => (
            <Badge key={level} variant="secondary" className="text-xs gap-1">
              <span className="text-muted-foreground">{level}:</span>
              {nameForLevel(level)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

export function LocationsTable() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationItem | null>(null);

  const { data: locations = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'locations'],
    queryFn: () => locationsApi.list(),
  });

  const { data: levelNames = [] } = useQuery({
    queryKey: ['admin', 'locations', 'level-names'],
    queryFn: () => locationsApi.getLevelNames(),
  });

  const levelLabel = (level: number): string =>
    levelNames.find((n) => n.level === level)?.name ?? `Niveau ${level}`;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'locations'] });
      toast.success(t('admin.locations.toasts.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.locations.toasts.deleteError')));
      setDeleteTarget(null);
    },
  });

  const openCreateDialog = () => {
    setEditingLocation(null);
    setDialogOpen(true);
  };

  const openEditDialog = (location: LocationItem) => {
    setEditingLocation(location);
    setDialogOpen(true);
  };

  const handleDelete = (location: LocationItem) => {
    setDeleteTarget(location);
  };

  return (
    <div className="space-y-4">
      <LevelNamesCard />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">
          {t('admin.locations.total', { count: locations.length })}
        </span>

        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          {t('admin.locations.actions.create')}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.locations.columns.name')}</TableHead>
              <TableHead>{t('admin.locations.columns.path')}</TableHead>
              <TableHead>{t('admin.locations.columns.level')}</TableHead>
              <TableHead>{t('admin.locations.columns.code')}</TableHead>
              <TableHead>{t('admin.locations.columns.description')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-destructive">
                  {t('admin.locations.states.error')}
                </TableCell>
              </TableRow>
            ) : locations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('admin.locations.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{location.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{location.fullPath}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{levelLabel(location.level)}</Badge>
                  </TableCell>
                  <TableCell>{location.code || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                    {location.description || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('common.edit')}
                        onClick={() => openEditDialog(location)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title={t('common.delete')}
                        onClick={() => handleDelete(location)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LocationFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingLocation(null);
        }}
        location={editingLocation}
        locations={locations}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'locations'] });
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('admin.locations.confirmDelete.title')}
        description={
          deleteTarget
            ? t('admin.locations.confirmDelete.description', { name: deleteTarget.name })
            : undefined
        }
        confirmLabel={t('common.delete')}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
