'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, Pencil, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { categoriesApi, type CategoryItem } from '@/lib/categories.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CategoryFormDialog } from './category-form-dialog';

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

export function CategoriesTable() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  const { data: categories = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => categoriesApi.list(),
  });

  const setCategoryStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? categoriesApi.activate(id) : categoriesApi.deactivate(id),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast.success(
        variables.isActive
          ? t('admin.categories.toasts.activateSuccess')
          : t('admin.categories.toasts.deactivateSuccess'),
      );
    },
    onError: (error, variables) => {
      toast.error(
        getErrorMessage(
          error,
          variables.isActive
            ? t('admin.categories.toasts.activateError')
            : t('admin.categories.toasts.deactivateError'),
        ),
      );
    },
  });

  const filteredCategories = useMemo(() => {
    if (statusFilter === 'active') return categories.filter((category) => category.isActive);
    if (statusFilter === 'inactive') return categories.filter((category) => !category.isActive);
    return categories;
  }, [categories, statusFilter]);

  const openCreateDialog = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const openEditDialog = (category: CategoryItem) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className={selectClass}
          >
            <option value="all">{t('admin.categories.filters.allStatuses')}</option>
            <option value="active">{t('admin.categories.filters.active')}</option>
            <option value="inactive">{t('admin.categories.filters.inactive')}</option>
          </select>

          <span className="text-sm text-muted-foreground">
            {t('admin.categories.total', { count: filteredCategories.length })}
          </span>
        </div>

        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          {t('admin.categories.actions.create')}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.categories.columns.name')}</TableHead>
              <TableHead>{t('admin.categories.columns.description')}</TableHead>
              <TableHead>{t('admin.categories.columns.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-destructive">
                  {t('admin.categories.states.error')}
                </TableCell>
              </TableRow>
            ) : filteredCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  {t('admin.categories.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              filteredCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {category.description || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? 'success' : 'destructive'}>
                      {category.isActive
                        ? t('admin.categories.status.active')
                        : t('admin.categories.status.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('common.edit')}
                        onClick={() => openEditDialog(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={
                          category.isActive
                            ? t('admin.categories.actions.deactivate')
                            : t('admin.categories.actions.activate')
                        }
                        onClick={() =>
                          setCategoryStatusMutation.mutate({
                            id: category.id,
                            isActive: !category.isActive,
                          })
                        }
                        disabled={setCategoryStatusMutation.isPending}
                      >
                        {category.isActive ? (
                          <ToggleLeft className="h-4 w-4 text-destructive" />
                        ) : (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingCategory(null);
        }}
        category={editingCategory}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
        }}
      />
    </div>
  );
}
