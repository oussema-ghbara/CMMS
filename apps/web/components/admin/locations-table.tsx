'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, MapPin, Pencil, Trash2, Plus } from 'lucide-react';
import { locationsApi, type LocationItem } from '@/lib/locations.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LocationFormDialog } from './location-form-dialog';

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

  const { data: locations = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'locations'],
    queryFn: () => locationsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'locations'] });
      toast.success(t('admin.locations.toasts.deleteSuccess'));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.locations.toasts.deleteError')));
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
    const confirmed = window.confirm(
      t('admin.locations.confirmDelete', {
        name: location.name,
      }),
    );

    if (!confirmed) return;
    deleteMutation.mutate(location.id);
  };

  return (
    <div className="space-y-4">
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
                    <Badge variant="secondary">{t('admin.locations.levelBadge', { level: location.level })}</Badge>
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
    </div>
  );
}
