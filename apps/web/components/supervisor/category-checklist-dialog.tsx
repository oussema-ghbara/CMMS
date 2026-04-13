'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  categoriesApi,
  type CategoryChecklistTemplateItem,
  type CategoryItem,
} from '@/lib/categories.api';
import { cn } from '@/lib/utils';
import {
  CategoryChecklistItemDialog,
  type CategoryChecklistFormValues,
} from './category-checklist-item-dialog';

interface CategoryChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryItem | null;
}

export function CategoryChecklistDialog({
  open,
  onOpenChange,
  category,
}: CategoryChecklistDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryChecklistTemplateItem | null>(null);
  const [orderedItems, setOrderedItems] = useState<CategoryChecklistTemplateItem[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'categories', category?.id, 'detail'],
    queryFn: () => categoriesApi.getById(category!.id),
    enabled: open && !!category?.id,
  });

  useEffect(() => {
    setOrderedItems(detail?.checklistTemplateItems ?? []);
  }, [detail]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'categories', category?.id] });
  };

  const addItemMutation = useMutation({
    mutationFn: (payload: Parameters<typeof categoriesApi.addChecklistItem>[1]) =>
      categoriesApi.addChecklistItem(category!.id, payload),
    onSuccess: () => {
      invalidate();
      toast.success(t('supervisorCategories.toasts.itemCreateSuccess'));
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => toast.error(t('supervisorCategories.toasts.itemCreateError')),
  });

  const updateItemMutation = useMutation({
    mutationFn: (payload: { itemId: string; body: Parameters<typeof categoriesApi.updateChecklistItem>[2] }) =>
      categoriesApi.updateChecklistItem(category!.id, payload.itemId, payload.body),
    onSuccess: () => {
      invalidate();
      toast.success(t('supervisorCategories.toasts.itemUpdateSuccess'));
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => toast.error(t('supervisorCategories.toasts.itemUpdateError')),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => categoriesApi.deleteChecklistItem(category!.id, itemId),
    onSuccess: () => {
      invalidate();
      toast.success(t('supervisorCategories.toasts.itemDeleteSuccess'));
    },
    onError: () => toast.error(t('supervisorCategories.toasts.itemDeleteError')),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      categoriesApi.reorderChecklistItems(category!.id, items),
    onSuccess: () => {
      invalidate();
    },
    onError: () => toast.error(t('supervisorCategories.toasts.reorderError')),
  });

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setEditingItem(null);
      setItemDialogOpen(false);
      setDraggedItemId(null);
    }
  };

  const handleDragStart = (itemId: string) => setDraggedItemId(itemId);

  const handleDrop = (targetId: string) => {
    if (!draggedItemId || draggedItemId === targetId) return;
    const current = [...orderedItems];
    const fromIndex = current.findIndex((item) => item.id === draggedItemId);
    const toIndex = current.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setOrderedItems(current);
    reorderMutation.mutate(current.map((item, index) => ({ id: item.id, sortOrder: index })));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...orderedItems];
    const [moved] = next.splice(index, 1);
    next.splice(index - 1, 0, moved);
    setOrderedItems(next);
    reorderMutation.mutate(next.map((entry, i) => ({ id: entry.id, sortOrder: i })));
  };

  const handleMoveDown = (index: number) => {
    if (index === orderedItems.length - 1) return;
    const next = [...orderedItems];
    const [moved] = next.splice(index, 1);
    next.splice(index + 1, 0, moved);
    setOrderedItems(next);
    reorderMutation.mutate(next.map((entry, i) => ({ id: entry.id, sortOrder: i })));
  };

  const handleDeleteItem = (item: CategoryChecklistTemplateItem) => {
    if (!window.confirm(t('supervisorCategories.checklist.deleteConfirm'))) return;
    deleteItemMutation.mutate(item.id);
  };

  const submitChecklistItem = (values: CategoryChecklistFormValues) => {
    if (!category) return;

    const body = {
      description: values.description,
      taskType: values.taskType,
      expectedCondition: values.expectedCondition || undefined,
      isMandatory: values.isMandatory,
      autoCreateCorrectiveWO: values.autoCreateCorrectiveWO,
      sortOrder: editingItem?.sortOrder ?? orderedItems.length,
    };

    if (editingItem) {
      updateItemMutation.mutate({ itemId: editingItem.id, body });
      return;
    }

    addItemMutation.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('supervisorCategories.checklist.dialogTitle', { name: category?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('supervisorCategories.checklist.dialogDescription')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t('supervisorCategories.states.error')}
          </div>
        ) : detail ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={detail.isActive ? 'success' : 'destructive'}>
                {detail.isActive ? t('common.active') : t('common.inactive')}
              </Badge>
              {detail.description && (
                <p className="text-sm text-muted-foreground">{detail.description}</p>
              )}
              <span className="ml-auto text-sm text-muted-foreground">
                {t('supervisorCategories.checklist.itemCount', { count: orderedItems.length })}
              </span>
            </div>

            <Separator />

            <div className="space-y-3">
              {orderedItems.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t('supervisorCategories.checklist.empty')}
                </div>
              ) : (
                orderedItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(item.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border bg-card p-4 transition-shadow',
                      draggedItemId === item.id && 'ring-2 ring-primary',
                    )}
                  >
                    <button
                      type="button"
                      className="mt-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label={t('supervisorCategories.checklist.dragHandle')}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">#{index + 1}</Badge>
                        <Badge variant="outline">{t(`supervisorCategories.taskType.${item.taskType}`)}</Badge>
                        {item.isMandatory && (
                          <Badge variant="warning">{t('supervisorCategories.checklist.mandatory')}</Badge>
                        )}
                        {item.autoCreateCorrectiveWO && (
                          <Badge variant="success">{t('supervisorCategories.checklist.autoCreateCorrectiveWO')}</Badge>
                        )}
                      </div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.expectedCondition
                          ? t('supervisorCategories.checklist.expectedCondition', { value: item.expectedCondition })
                          : t('supervisorCategories.checklist.noExpectedCondition')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('common.edit')}
                        onClick={() => {
                          setEditingItem(item);
                          setItemDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('common.delete')}
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteItem(item)}
                        disabled={deleteItemMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t('supervisorCategories.checklist.moveUp')}
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t('supervisorCategories.checklist.moveDown')}
                          disabled={index === orderedItems.length - 1}
                          onClick={() => handleMoveDown(index)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                {t('common.close')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setItemDialogOpen(true);
                }}
                disabled={addItemMutation.isPending || updateItemMutation.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('supervisorCategories.checklist.addAction')}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {category && (
          <CategoryChecklistItemDialog
            open={itemDialogOpen}
            onOpenChange={setItemDialogOpen}
            item={editingItem}
            onSubmit={submitChecklistItem}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
