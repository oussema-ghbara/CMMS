'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, Search, X } from 'lucide-react';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { PartUnit } from '@gmao/shared';
import { inventoryApi } from '@/lib/inventory.api';
import type { PartCatalogItem } from '@/lib/inventory.api';
import { MasterDetail } from '@/components/ui/master-detail';
import { Mono } from '@/components/ui/mono';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { PartDetailPanel } from '@/components/storekeeper/part-detail-panel';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
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

function rowBorderColor(part: PartCatalogItem): string {
  if (!part.isActive) return 'var(--sb-text-tertiary)';
  if (part.minimumStockThreshold > 0 && part.currentStock < part.minimumStockThreshold) return 'var(--sb-p-high)';
  return 'var(--sb-s-done)';
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

const inputS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 34,
  padding: '0 10px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 34,
  padding: '0 4px 0 8px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
};

function btnPrimaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    background: disabled ? 'var(--sb-border)' : 'var(--sb-text-primary)',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
    border: 'none',
    borderRadius: 2,
    padding: '6px 14px',
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  };
}

function btnSecondaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'transparent',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    border: '1px solid var(--sb-border-strong)',
    borderRadius: 2,
    padding: '6px 14px',
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
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
  const [selectedPart, setSelectedPart] = useState<PartCatalogItem | null>(null);
  const [lowStockBannerDismissed, setLowStockBannerDismissed] = useState(false);

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

  const { data: lowStockParts } = useQuery({
    queryKey: ['storekeeper', 'low-stock'],
    queryFn: inventoryApi.getLowStock,
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

  useEffect(() => {
    if (!lowStockParts || lowStockParts.length === 0) {
      setLowStockBannerDismissed(false);
    }
  }, [lowStockParts]);

  useEffect(() => {
    if (!selectedPart || !data) return;
    const updated = data.data.find((p) => p.id === selectedPart.id);
    if (updated) setSelectedPart(updated);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const isSubmitPending = createMutation.isPending || updateMutation.isPending;
  const isEdit = !!editingPart;
  const panelOpen = !!selectedPart;

  const openCreateDialog = () => { setEditingPart(null); setDialogOpen(true); };
  const openEditDialog = (part: PartCatalogItem) => { setEditingPart(part); setDialogOpen(true); };

  const closeDialog = () => { setDialogOpen(false); setEditingPart(null); };

  const handleCommitSearch = () => { setSearch(searchInput); setPage(1); };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('all');
    setPage(1);
  };

  const hasActiveFilters = !!(searchInput || search || statusFilter !== 'all');

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
    if (editingPart) { updateMutation.mutate({ id: editingPart.id, payload }); return; }
    createMutation.mutate(payload);
  };

  useEffect(() => {
    if (!dialogOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitPending) closeDialog();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [dialogOpen, isSubmitPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridCols = panelOpen
    ? '120px 1fr 70px 90px'
    : '120px 1fr 70px 80px 70px 1fr 90px';

  const listContent = (
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
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--sb-text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('storekeeperInventory.filters.searchPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCommitSearch(); } }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            style={{
              height: 26,
              paddingLeft: 26,
              paddingRight: 8,
              width: 200,
              border: '1px solid var(--sb-border)',
              borderRadius: 2,
              fontFamily: 'inherit',
              fontSize: 12,
              color: 'var(--sb-text-primary)',
              background: 'var(--sb-bg)',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--sb-border)', flexShrink: 0 }} />

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'all' | 'active' | 'inactive'); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="all">{t('storekeeperInventory.filters.allStatuses')}</option>
          <option value="active">{t('storekeeperInventory.filters.active')}</option>
          <option value="inactive">{t('storekeeperInventory.filters.inactive')}</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--sb-text-tertiary)',
              padding: '0 2px',
              flexShrink: 0,
            }}
          >
            {t('storekeeperInventory.filters.reset')}
          </button>
        )}

        <div style={{ flex: 1 }} />

        {data && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {t('storekeeperInventory.total', { count: data.total })}
          </Mono>
        )}

        <button
          type="button"
          onClick={openCreateDialog}
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
          + {t('storekeeperInventory.actions.create')}
        </button>
      </div>

      {/* Low-stock banner */}
      {lowStockParts && lowStockParts.length > 0 && !lowStockBannerDismissed && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '0 16px',
            height: 36,
            borderBottom: '1px solid rgba(160,96,32,0.3)',
            background: 'var(--sb-p-high-bg)',
          }}
        >
          <Mono size={10} color="var(--sb-p-high)">
            {t('storekeeperInventory.lowStockBanner', { count: lowStockParts.length })}
          </Mono>
          <button
            type="button"
            onClick={() => setLowStockBannerDismissed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--sb-p-high)',
              opacity: 0.7,
              padding: 2,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Column headers */}
      {!isLoading && !isError && !!data?.data.length && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            padding: '0 16px 0 19px',
            height: 28,
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.reference')}</Mono>
          <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.part')}</Mono>
          <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.unit')}</Mono>
          <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.stock')}</Mono>
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.minimum')}</Mono>}
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.location')}</Mono>}
          <Mono size={8} tracking="0.13em">{t('storekeeperInventory.columns.status')}</Mono>
        </div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('storekeeperInventory.states.error')} />
        ) : !data?.data.length ? (
          <TableEmpty label={t('storekeeperInventory.states.empty')} />
        ) : (
          data.data.map((part) => {
            const isLowStock = part.minimumStockThreshold > 0 && part.currentStock < part.minimumStockThreshold;
            const isSelected = selectedPart?.id === part.id;
            return (
              <div
                key={part.id}
                onClick={() => setSelectedPart(isSelected ? null : part)}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--sb-hover)'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridCols,
                  padding: '0 16px 0 13px',
                  height: 44,
                  alignItems: 'center',
                  gap: 8,
                  borderBottom: '1px solid var(--sb-border)',
                  borderLeft: `3px solid ${rowBorderColor(part)}`,
                  background: isSelected ? 'var(--sb-s-active-bg)' : 'transparent',
                  outline: isSelected ? '1px solid var(--sb-border-strong)' : 'none',
                  outlineOffset: -1,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <Mono size={10} color="var(--sb-text-primary)" weight={600} tracking="0.06em">
                  {part.referenceCode}
                </Mono>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {part.name}
                  </div>
                  {!panelOpen && part.description && (
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {part.description}
                    </Mono>
                  )}
                </div>

                <Mono size={10} color="var(--sb-text-secondary)">
                  {t(`storekeeperInventory.units.${part.unit}`)}
                </Mono>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontSize: 13,
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: isLowStock ? 'var(--sb-p-high)' : 'var(--sb-text-primary)',
                  }}>
                    {part.currentStock}
                  </span>
                  {isLowStock && (
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 5px',
                      background: 'var(--sb-p-high-bg)',
                      border: '1px solid rgba(160,96,32,0.3)',
                      borderRadius: 2,
                      fontSize: 8,
                      fontFamily: MONO,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--sb-p-high)',
                    }}>
                      {t('storekeeperInventory.labels.lowStock')}
                    </span>
                  )}
                </div>

                {!panelOpen && (
                  <Mono size={11} color="var(--sb-text-secondary)">{part.minimumStockThreshold}</Mono>
                )}

                {!panelOpen && (
                  <Mono size={11} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {part.warehouseLocation || t('storekeeperInventory.labels.noLocation')}
                  </Mono>
                )}

                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: part.isActive ? 'var(--sb-s-done-bg)' : 'var(--sb-surface)',
                  border: `1px solid ${part.isActive ? 'rgba(46,122,78,0.28)' : 'var(--sb-border)'}`,
                  borderRadius: 2,
                  padding: '2px 7px 2px 5px',
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: part.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)',
                    display: 'inline-block',
                    flexShrink: 0,
                  }} />
                  <Mono size={9} color={part.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)'} tracking="0.10em">
                    {part.isActive
                      ? t('storekeeperInventory.status.active')
                      : t('storekeeperInventory.status.inactive')}
                  </Mono>
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          height: 36,
          padding: '0 16px',
          borderTop: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}
      >
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MasterDetail
        list={listContent}
        panel={
          selectedPart ? (
            <PartDetailPanel
              key={selectedPart.id}
              part={selectedPart}
              onClose={() => setSelectedPart(null)}
              onEdit={openEditDialog}
            />
          ) : null
        }
        panelOpen={panelOpen}
      />

      {/* Part create / edit dialog */}
      {dialogOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !isSubmitPending) closeDialog(); }}
        >
          <div
            style={{
              background: 'var(--sb-bg)',
              border: '1px solid var(--sb-border)',
              width: 480,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Dialog header */}
            <div
              style={{
                background: 'var(--sb-rail)',
                padding: '0 16px',
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexShrink: 0,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Mono size={11} color="rgba(255,255,255,0.90)" weight={600} tracking="0.08em">
                {isEdit ? t('storekeeperInventory.dialog.editTitle') : t('storekeeperInventory.dialog.createTitle')}
              </Mono>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitPending}
                style={{
                  flexShrink: 0,
                  color: 'rgba(255,255,255,0.55)',
                  background: 'none',
                  border: 'none',
                  cursor: isSubmitPending ? 'not-allowed' : 'pointer',
                  padding: 4,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit(submitPart)}
              style={{ flex: 1, overflowY: 'auto', padding: 20 }}
            >
              {/* Name */}
              <div style={{ marginBottom: 14 }}>
                <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                  {t('storekeeperInventory.form.name')}
                </Mono>
                <input
                  style={inputS}
                  autoFocus
                  maxLength={200}
                  {...register('name')}
                />
                {errors.name && (
                  <span style={{ fontSize: 11, color: 'var(--sb-p-crit)', display: 'block', marginTop: 4 }}>
                    {t('storekeeperInventory.validation.name')}
                  </span>
                )}
              </div>

              {/* Reference + Unit */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                    {t('storekeeperInventory.form.referenceCode')}
                  </Mono>
                  <input
                    style={inputS}
                    maxLength={100}
                    {...register('referenceCode')}
                  />
                  {errors.referenceCode && (
                    <span style={{ fontSize: 11, color: 'var(--sb-p-crit)', display: 'block', marginTop: 4 }}>
                      {t('storekeeperInventory.validation.referenceCode')}
                    </span>
                  )}
                </div>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                    {t('storekeeperInventory.form.unit')}
                  </Mono>
                  <select
                    style={selectS}
                    {...register('unit')}
                  >
                    <option value={PartUnit.PIECE}>{t('storekeeperInventory.units.PIECE')}</option>
                    <option value={PartUnit.LITER}>{t('storekeeperInventory.units.LITER')}</option>
                    <option value={PartUnit.KG}>{t('storekeeperInventory.units.KG')}</option>
                    <option value={PartUnit.METER}>{t('storekeeperInventory.units.METER')}</option>
                    <option value={PartUnit.OTHER}>{t('storekeeperInventory.units.OTHER')}</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                  {t('storekeeperInventory.form.description')}
                </Mono>
                <input
                  style={inputS}
                  maxLength={1000}
                  {...register('description')}
                />
              </div>

              {/* Min stock + Unit cost */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                    {t('storekeeperInventory.form.minimumStockThreshold')}
                  </Mono>
                  <input
                    type="number"
                    min={0}
                    style={inputS}
                    {...register('minimumStockThreshold', {
                      setValueAs: (value) => (value === '' ? 0 : Number(value)),
                    })}
                  />
                  {errors.minimumStockThreshold && (
                    <span style={{ fontSize: 11, color: 'var(--sb-p-crit)', display: 'block', marginTop: 4 }}>
                      {t('storekeeperInventory.validation.minimumStockThreshold')}
                    </span>
                  )}
                </div>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                    {t('storekeeperInventory.form.unitCost')}
                  </Mono>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    style={inputS}
                    {...register('unitCost', {
                      setValueAs: (value) => (value === '' ? 0 : Number(value)),
                    })}
                  />
                  {errors.unitCost && (
                    <span style={{ fontSize: 11, color: 'var(--sb-p-crit)', display: 'block', marginTop: 4 }}>
                      {t('storekeeperInventory.validation.unitCost')}
                    </span>
                  )}
                </div>
              </div>

              {/* Warehouse location */}
              <div style={{ marginBottom: 20 }}>
                <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                  {t('storekeeperInventory.form.warehouseLocation')}
                </Mono>
                <input
                  style={inputS}
                  maxLength={200}
                  {...register('warehouseLocation')}
                />
              </div>

              {/* Form actions */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  paddingTop: 16,
                  borderTop: '1px solid var(--sb-border)',
                }}
              >
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={isSubmitPending}
                  style={btnSecondaryStyle(isSubmitPending)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitPending}
                  style={btnPrimaryStyle(isSubmitPending)}
                >
                  {isSubmitPending && (
                    <Loader2
                      style={{ width: 11, height: 11, marginRight: 5, animation: 'spin 1s linear infinite' }}
                    />
                  )}
                  {isEdit ? t('storekeeperInventory.actions.save') : t('storekeeperInventory.actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
