'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mono } from '@/components/ui/mono';
import {
  categoriesApi,
  type CategoryChecklistTemplateItem,
  type CategoryItem,
  type ChecklistTaskType,
} from '@/lib/categories.api';
import {
  CategoryChecklistItemDialog,
  type CategoryChecklistFormValues,
} from './category-checklist-item-dialog';

const TASK_TYPE_COLOR: Record<ChecklistTaskType, string> = {
  INSPECTION:  'var(--sb-p-norm)',
  MEASUREMENT: 'var(--sb-s-active)',
  LUBRICATION: 'var(--sb-s-done)',
  CLEANING:    'var(--sb-s-open)',
  REPLACEMENT: 'var(--sb-p-crit)',
  CALIBRATION: 'var(--sb-p-high)',
  ADJUSTMENT:  'var(--sb-s-wait)',
};

const TASK_TYPE_BG: Record<ChecklistTaskType, string> = {
  INSPECTION:  'var(--sb-p-norm-bg)',
  MEASUREMENT: 'var(--sb-s-active-bg)',
  LUBRICATION: 'var(--sb-s-done-bg)',
  CLEANING:    'var(--sb-s-open-bg)',
  REPLACEMENT: 'var(--sb-p-crit-bg)',
  CALIBRATION: 'var(--sb-p-high-bg)',
  ADJUSTMENT:  'var(--sb-s-wait-bg)',
};

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !itemDialogOpen) onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, itemDialogOpen, onOpenChange]);

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
    onSuccess: () => { invalidate(); },
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
    setDraggedItemId(null);
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

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 10001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(false); }}
      >
        <div style={{
          background: 'var(--sb-bg)',
          border: '1px solid var(--sb-border)',
          width: 760,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          { }
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--sb-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
                {t('supervisorCategories.checklist.dialogTitle', { name: category?.name ?? '' })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', marginTop: 3 }}>
                {t('supervisorCategories.checklist.dialogDescription')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleClose(false)}
              style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}
            >
              <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
            </button>
          </div>

          { }
          {detail && (
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--sb-border)', background: 'var(--sb-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: detail.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)', flexShrink: 0 }} />
                <Mono size={9} color={detail.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)'}>
                  {detail.isActive ? t('common.active').toUpperCase() : t('common.inactive').toUpperCase()}
                </Mono>
              </span>
              {detail.description && (
                <span style={{ fontSize: 12, color: 'var(--sb-text-secondary)' }}>{detail.description}</span>
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Mono size={9} color="var(--sb-text-tertiary)">
                  {t('supervisorCategories.checklist.itemCount', { count: orderedItems.length })}
                </Mono>
              </span>
            </div>
          )}

          { }
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
                <Loader2 style={{ width: 20, height: 20, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : isError ? (
              <div style={{ padding: '10px 14px', border: '1px solid var(--sb-p-crit)', background: 'var(--sb-p-crit-bg)' }}>
                <Mono size={10} color="var(--sb-p-crit)">{t('supervisorCategories.states.error').toUpperCase()}</Mono>
              </div>
            ) : orderedItems.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <Mono size={10} color="var(--sb-text-tertiary)">{t('supervisorCategories.checklist.empty').toUpperCase()}</Mono>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {orderedItems.map((item, index) => {
                  const typeColor = TASK_TYPE_COLOR[item.taskType];
                  const typeBg = TASK_TYPE_BG[item.taskType];
                  const isDragging = draggedItemId === item.id;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleDragStart(item.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(item.id)}
                      onDragEnd={() => setDraggedItemId(null)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px',
                        border: `1px solid ${isDragging ? 'var(--sb-border-strong)' : 'var(--sb-border)'}`,
                        borderLeft: `3px solid ${typeColor}`,
                        background: isDragging ? 'var(--sb-surface)' : 'white',
                        opacity: isDragging ? 0.6 : 1,
                        cursor: 'default',
                      }}
                    >

                      <button
                        type="button"
                        aria-label={t('supervisorCategories.checklist.dragHandle')}
                        style={{ background: 'transparent', border: 'none', padding: '2px 2px', cursor: 'grab', color: 'var(--sb-text-tertiary)', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center' }}
                      >
                        <GripVertical style={{ width: 14, height: 14 }} />
                      </button>

                      <div style={{ flexShrink: 0, width: 22, textAlign: 'right', paddingTop: 1 }}>
                        <Mono size={9} color="var(--sb-text-tertiary)" weight={600}>#{index + 1}</Mono>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>

                          <span style={{ display: 'inline-block', background: typeBg, border: `1px solid ${typeColor}44`, borderRadius: 2, padding: '1px 6px' }}>
                            <Mono size={8} color={typeColor} tracking="0.08em">{item.taskType}</Mono>
                          </span>

                          {item.isMandatory && (
                            <span style={{ display: 'inline-block', background: 'var(--sb-p-crit-bg)', border: '1px solid var(--sb-p-crit)44', borderRadius: 2, padding: '1px 6px' }}>
                              <Mono size={8} color="var(--sb-p-crit)" tracking="0.08em">{t('supervisorCategories.checklist.mandatory').toUpperCase()}</Mono>
                            </span>
                          )}

                          {item.autoCreateCorrectiveWO && (
                            <span style={{ display: 'inline-block', background: 'var(--sb-s-done-bg)', border: '1px solid var(--sb-s-done)44', borderRadius: 2, padding: '1px 6px' }}>
                              <Mono size={8} color="var(--sb-s-done)" tracking="0.08em">{t('supervisorCategories.checklist.autoCreateCorrectiveWO').toUpperCase()}</Mono>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', marginBottom: 3 }}>
                          {item.description}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)' }}>
                          {item.expectedCondition
                            ? t('supervisorCategories.checklist.expectedCondition', { value: item.expectedCondition })
                            : t('supervisorCategories.checklist.noExpectedCondition')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>

                        <button
                          type="button"
                          title={t('supervisorCategories.checklist.moveUp')}
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                          style={{ background: 'transparent', border: 'none', padding: '4px 5px', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)', display: 'flex', alignItems: 'center', opacity: index === 0 ? 0.35 : 1 }}
                        >
                          <ArrowUp style={{ width: 13, height: 13 }} />
                        </button>

                        <button
                          type="button"
                          title={t('supervisorCategories.checklist.moveDown')}
                          disabled={index === orderedItems.length - 1}
                          onClick={() => handleMoveDown(index)}
                          style={{ background: 'transparent', border: 'none', padding: '4px 5px', cursor: index === orderedItems.length - 1 ? 'default' : 'pointer', color: index === orderedItems.length - 1 ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)', display: 'flex', alignItems: 'center', opacity: index === orderedItems.length - 1 ? 0.35 : 1 }}
                        >
                          <ArrowDown style={{ width: 13, height: 13 }} />
                        </button>

                        <button
                          type="button"
                          title={t('common.edit')}
                          onClick={() => { setEditingItem(item); setItemDialogOpen(true); }}
                          style={{ background: 'transparent', border: 'none', padding: '4px 5px', cursor: 'pointer', color: 'var(--sb-text-secondary)', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sb-text-primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
                        >
                          <Pencil style={{ width: 13, height: 13 }} />
                        </button>

                        <button
                          type="button"
                          title={t('common.delete')}
                          onClick={() => handleDeleteItem(item)}
                          disabled={deleteItemMutation.isPending}
                          style={{ background: 'transparent', border: 'none', padding: '4px 5px', cursor: 'pointer', color: 'var(--sb-text-tertiary)', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sb-p-crit)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sb-text-tertiary)'; }}
                        >
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--sb-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0, background: 'var(--sb-surface)' }}>
            <button
              type="button"
              onClick={() => handleClose(false)}
              style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--sb-border)', cursor: 'pointer', fontSize: 12, color: 'var(--sb-text-secondary)', borderRadius: 2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sb-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              disabled={addItemMutation.isPending || updateItemMutation.isPending}
              onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}
              style={{ padding: '6px 14px', background: 'var(--sb-text-primary)', border: '1px solid var(--sb-text-primary)', cursor: 'pointer', fontSize: 12, color: 'var(--sb-bg)', fontWeight: 600, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              {t('supervisorCategories.checklist.addAction')}
            </button>
          </div>
        </div>
      </div>

      {category && (
        <CategoryChecklistItemDialog
          open={itemDialogOpen}
          onOpenChange={setItemDialogOpen}
          item={editingItem}
          onSubmit={submitChecklistItem}
        />
      )}
    </>
  );
}
