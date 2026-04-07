'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, Plus, Pencil, Power, PowerOff, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { PartUnit } from '@gmao/shared';
import { inventoryApi } from '@/lib/inventory.api';
import type { PartCatalogItem } from '@/lib/inventory.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LIMIT = 20;

const partSchema = z.object({
  name: z.string().trim().min(1).max(200),
  referenceCode: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  unit: z.nativeEnum(PartUnit),
  minimumStockThreshold: z.number().int().min(0),
  warehouseLocation: z.string().trim().max(200).optional(),
  unitCost: z.number().min(0),
});

type PartFormValues = z.infer<typeof partSchema>;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function toFormValues(part?: PartCatalogItem | null): PartFormValues {
  return {
    name: part?.name ?? '',
    referenceCode: part?.referenceCode ?? '',
    description: part?.description ?? '',
    unit: part?.unit ?? PartUnit.PIECE,
    minimumStockThreshold: part?.minimumStockThreshold ?? 0,
    warehouseLocation: part?.warehouseLocation ?? '',
    unitCost: Number(part?.unitCost ?? 0),
  };
}

export function InventoryCatalog() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<PartCatalogItem | null>(null);
  const [togglingPartId, setTogglingPartId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(statusFilter === 'active' ? { isActive: true } : {}),
      ...(statusFilter === 'inactive' ? { isActive: false } : {}),
    }),
    [page, search, statusFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'inventory', queryParams],
    queryFn: () => inventoryApi.getParts(queryParams),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PartFormValues>({
    resolver: zodResolver(partSchema),
    defaultValues: toFormValues(),
  });

  useEffect(() => {
    if (dialogOpen) {
      reset(toFormValues(editingPart));
    }
  }, [dialogOpen, editingPart, reset]);

  const createMutation = useMutation({
    mutationFn: inventoryApi.createPart,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      toast.success(t('storekeeperInventory.toasts.createSuccess'));
      setDialogOpen(false);
      setEditingPart(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('storekeeperInventory.toasts.createError')));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof inventoryApi.updatePart>[1] }) =>
      inventoryApi.updatePart(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      toast.success(t('storekeeperInventory.toasts.updateSuccess'));
      setDialogOpen(false);
      setEditingPart(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('storekeeperInventory.toasts.updateError')));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? inventoryApi.deactivatePart(id) : inventoryApi.activatePart(id),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      toast.success(
        variables.isActive
          ? t('storekeeperInventory.toasts.deactivateSuccess')
          : t('storekeeperInventory.toasts.activateSuccess'),
      );
      setTogglingPartId(null);
    },
    onError: (error, variables) => {
      toast.error(
        getErrorMessage(
          error,
          variables.isActive
            ? t('storekeeperInventory.toasts.deactivateError')
            : t('storekeeperInventory.toasts.activateError'),
        ),
      );
      setTogglingPartId(null);
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const isSubmitPending = createMutation.isPending || updateMutation.isPending;
  const isEdit = !!editingPart;

  const openCreateDialog = () => {
    setEditingPart(null);
    setDialogOpen(true);
  };

  const openEditDialog = (part: PartCatalogItem) => {
    setEditingPart(part);
    setDialogOpen(true);
  };

  const submitPart = (values: PartFormValues) => {
    const payload = {
      name: values.name.trim(),
      referenceCode: values.referenceCode.trim(),
      description: values.description?.trim() ? values.description.trim() : undefined,
      unit: values.unit,
      minimumStockThreshold: values.minimumStockThreshold,
      warehouseLocation: values.warehouseLocation?.trim() ? values.warehouseLocation.trim() : undefined,
      unitCost: values.unitCost,
    };

    if (editingPart) {
      updateMutation.mutate({ id: editingPart.id, payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const handleTogglePart = (part: PartCatalogItem) => {
    setTogglingPartId(part.id);
    toggleMutation.mutate({ id: part.id, isActive: part.isActive });
  };

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('storekeeperInventory.filters.searchPlaceholder')}
              className="w-[260px] pl-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearch(searchInput);
                  setPage(1);
                }
              }}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            {t('storekeeperInventory.filters.apply')}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
            disabled={!searchInput && !search}
          >
            {t('storekeeperInventory.filters.reset')}
          </Button>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="all">{t('storekeeperInventory.filters.allStatuses')}</option>
            <option value="active">{t('storekeeperInventory.filters.active')}</option>
            <option value="inactive">{t('storekeeperInventory.filters.inactive')}</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <span className="text-sm text-muted-foreground">
              {t('storekeeperInventory.total', { count: data.total })}
            </span>
          )}

          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            {t('storekeeperInventory.actions.create')}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('storekeeperInventory.columns.part')}</TableHead>
              <TableHead>{t('storekeeperInventory.columns.reference')}</TableHead>
              <TableHead>{t('storekeeperInventory.columns.unit')}</TableHead>
              <TableHead>{t('storekeeperInventory.columns.stock')}</TableHead>
              <TableHead>{t('storekeeperInventory.columns.minimum')}</TableHead>
              <TableHead>{t('storekeeperInventory.columns.location')}</TableHead>
              <TableHead>{t('storekeeperInventory.columns.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-destructive">
                  {t('storekeeperInventory.states.error')}
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {t('storekeeperInventory.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((part) => {
                const isLowStock =
                  part.minimumStockThreshold > 0 && part.currentStock < part.minimumStockThreshold;

                return (
                  <TableRow key={part.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{part.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {part.description || t('storekeeperInventory.labels.noDescription')}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="text-sm">{part.referenceCode}</TableCell>

                    <TableCell>
                      <Badge variant="secondary">{t(`storekeeperInventory.units.${part.unit}`)}</Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{part.currentStock}</span>
                        {isLowStock && (
                          <Badge variant="warning">{t('storekeeperInventory.labels.lowStock')}</Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-sm">{part.minimumStockThreshold}</TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {part.warehouseLocation || t('storekeeperInventory.labels.noLocation')}
                    </TableCell>

                    <TableCell>
                      <Badge variant={part.isActive ? 'success' : 'destructive'}>
                        {part.isActive
                          ? t('storekeeperInventory.status.active')
                          : t('storekeeperInventory.status.inactive')}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('storekeeperInventory.actions.edit')}
                          onClick={() => openEditDialog(part)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          title={
                            part.isActive
                              ? t('storekeeperInventory.actions.deactivate')
                              : t('storekeeperInventory.actions.activate')
                          }
                          className={part.isActive ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}
                          onClick={() => handleTogglePart(part)}
                          disabled={toggleMutation.isPending && togglingPartId === part.id}
                        >
                          {toggleMutation.isPending && togglingPartId === part.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : part.isActive ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-sm text-muted-foreground">
            {t('storekeeperInventory.pagination', { page, totalPages })}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingPart(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t('storekeeperInventory.dialog.editTitle') : t('storekeeperInventory.dialog.createTitle')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(submitPart)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="part-name">{t('storekeeperInventory.form.name')}</Label>
              <Input id="part-name" {...register('name')} maxLength={200} />
              {errors.name && (
                <p className="text-xs text-destructive">{t('storekeeperInventory.validation.name')}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="part-reference">{t('storekeeperInventory.form.referenceCode')}</Label>
                <Input id="part-reference" {...register('referenceCode')} maxLength={100} />
                {errors.referenceCode && (
                  <p className="text-xs text-destructive">
                    {t('storekeeperInventory.validation.referenceCode')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="part-unit">{t('storekeeperInventory.form.unit')}</Label>
                <select id="part-unit" className={selectClass} {...register('unit')}>
                  <option value={PartUnit.PIECE}>{t('storekeeperInventory.units.PIECE')}</option>
                  <option value={PartUnit.LITER}>{t('storekeeperInventory.units.LITER')}</option>
                  <option value={PartUnit.KG}>{t('storekeeperInventory.units.KG')}</option>
                  <option value={PartUnit.METER}>{t('storekeeperInventory.units.METER')}</option>
                  <option value={PartUnit.OTHER}>{t('storekeeperInventory.units.OTHER')}</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="part-description">{t('storekeeperInventory.form.description')}</Label>
              <Input id="part-description" {...register('description')} maxLength={1000} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="part-min-stock">
                  {t('storekeeperInventory.form.minimumStockThreshold')}
                </Label>
                <Input
                  id="part-min-stock"
                  type="number"
                  min={0}
                  {...register('minimumStockThreshold', {
                    setValueAs: (value) => (value === '' ? 0 : Number(value)),
                  })}
                />
                {errors.minimumStockThreshold && (
                  <p className="text-xs text-destructive">
                    {t('storekeeperInventory.validation.minimumStockThreshold')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="part-unit-cost">{t('storekeeperInventory.form.unitCost')}</Label>
                <Input
                  id="part-unit-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  {...register('unitCost', {
                    setValueAs: (value) => (value === '' ? 0 : Number(value)),
                  })}
                />
                {errors.unitCost && (
                  <p className="text-xs text-destructive">
                    {t('storekeeperInventory.validation.unitCost')}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="part-location">{t('storekeeperInventory.form.warehouseLocation')}</Label>
              <Input id="part-location" {...register('warehouseLocation')} maxLength={200} />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitPending}
              >
                {t('common.cancel')}
              </Button>

              <Button type="submit" disabled={isSubmitPending}>
                {isSubmitPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? t('storekeeperInventory.actions.save') : t('storekeeperInventory.actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
