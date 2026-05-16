'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { categoriesApi, type CategoryItem } from '@/lib/categories.api';
import { Mono } from '@/components/ui/mono';
import { CategoryFormDialog } from './category-form-dialog';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

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

const GRID = '1fr 2fr 120px 100px';

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
      toast.success(variables.isActive ? t('admin.categories.toasts.activateSuccess') : t('admin.categories.toasts.deactivateSuccess'));
    },
    onError: (error, variables) => {
      toast.error(getErrorMessage(error, variables.isActive ? t('admin.categories.toasts.activateError') : t('admin.categories.toasts.deactivateError')));
    },
  });

  const filteredCategories = useMemo(() => {
    if (statusFilter === 'active') return categories.filter((c) => c.isActive);
    if (statusFilter === 'inactive') return categories.filter((c) => !c.isActive);
    return categories;
  }, [categories, statusFilter]);

  const headers = [
    t('admin.categories.columns.name'),
    t('admin.categories.columns.description'),
    t('admin.categories.columns.status'),
    t('common.actions'),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="all">{t('admin.categories.filters.allStatuses')}</option>
          <option value="active">{t('admin.categories.filters.active')}</option>
          <option value="inactive">{t('admin.categories.filters.inactive')}</option>
        </select>

        <div style={{ flex: 1 }} />

        {!isLoading && !isError && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {filteredCategories.length} {filteredCategories.length !== 1 ? t('admin.categories.columns.name').toUpperCase() + 'S' : t('admin.categories.columns.name').toUpperCase()}
          </Mono>
        )}

        <button
          type="button"
          onClick={() => { setEditingCategory(null); setDialogOpen(true); }}
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
          + {t('admin.categories.actions.create')}
        </button>
      </div>

      {/* Column headers */}
      {!isLoading && !isError && filteredCategories.length > 0 && (
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

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('admin.categories.states.error')} />
        ) : filteredCategories.length === 0 ? (
          <TableEmpty label={t('admin.categories.states.empty')} />
        ) : (
          filteredCategories.map((category) => (
            <div
              key={category.id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                padding: '0 16px',
                alignItems: 'center',
                minHeight: 44,
                borderBottom: '1px solid var(--sb-border)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {category.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {category.description || '—'}
              </div>
              <div>
                <ActivePill
                  isActive={category.isActive}
                  labelActive={t('admin.categories.status.active')}
                  labelInactive={t('admin.categories.status.inactive')}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <RowBtn onClick={() => { setEditingCategory(category); setDialogOpen(true); }}>
                  {t('common.edit')}
                </RowBtn>
                <RowBtn
                  onClick={() => setCategoryStatusMutation.mutate({ id: category.id, isActive: !category.isActive })}
                  disabled={setCategoryStatusMutation.isPending}
                  destructive={category.isActive}
                >
                  {category.isActive ? t('admin.categories.actions.deactivate') : t('admin.categories.actions.activate')}
                </RowBtn>
              </div>
            </div>
          ))
        )}
      </div>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingCategory(null); }}
        category={editingCategory}
        onSuccess={() => { void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] }); }}
      />
    </div>
  );
}
