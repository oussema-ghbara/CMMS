'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { QrCode, Search } from 'lucide-react';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { AssetCriticality, AssetStatus } from '@gmao/shared';
import { assetsApi, type AssetListItem, type QrLookupResult } from '@/lib/assets.api';
import { AxiosError } from 'axios';
import { categoriesApi } from '@/lib/categories.api';
import { MasterDetail } from '@/components/ui/master-detail';
import { Mono } from '@/components/ui/mono';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { AssetFormDialog } from './asset-form-dialog';
import { AssetDetailPanel } from './asset-detail-panel';

const LIMIT = 20;

const STATUS_OPTIONS = [
  AssetStatus.OPERATIONAL,
  AssetStatus.IN_MAINTENANCE,
  AssetStatus.MAINTENANCE_BLOCKED,
  AssetStatus.OUT_OF_SERVICE,
  AssetStatus.DECOMMISSIONED,
] as const;

const CRITICALITY_OPTIONS = [
  AssetCriticality.CRITICAL,
  AssetCriticality.STANDARD,
  AssetCriticality.NON_CRITICAL,
] as const;

const STATUS_DOT: Record<AssetStatus, string> = {
  [AssetStatus.OPERATIONAL]:         'var(--sb-s-done)',
  [AssetStatus.IN_MAINTENANCE]:      'var(--sb-s-active)',
  [AssetStatus.MAINTENANCE_BLOCKED]: 'var(--sb-p-high)',
  [AssetStatus.OUT_OF_SERVICE]:      'var(--sb-p-crit)',
  [AssetStatus.DECOMMISSIONED]:      'var(--sb-text-tertiary)',
};

const CRITICALITY_COLOR: Record<AssetCriticality, string> = {
  [AssetCriticality.CRITICAL]:    'var(--sb-p-crit)',
  [AssetCriticality.STANDARD]:    'var(--sb-text-secondary)',
  [AssetCriticality.NON_CRITICAL]:'var(--sb-text-tertiary)',
};

const filterSelectStyle: React.CSSProperties = {
  height: 26,
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  padding: '0 4px 0 8px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.08em',
  color: 'var(--sb-text-secondary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
};

export function AssetsBoard() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [criticalityFilter, setCriticalityFilter] = useState<AssetCriticality | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [selected, setSelected] = useState<AssetListItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetListItem | null>(null);

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrLookupPending, setQrLookupPending] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => categoriesApi.list(),
  });

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(criticalityFilter ? { criticality: criticalityFilter } : {}),
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    }),
    [page, search, statusFilter, criticalityFilter, categoryFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'assets', queryParams],
    queryFn: () => assetsApi.list(queryParams),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const panelOpen = selected !== null;

  const handleCommitSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setCriticalityFilter('');
    setCategoryFilter('');
    setPage(1);
  };

  const hasActiveFilters = !!(searchInput || search || statusFilter || criticalityFilter || categoryFilter);

  const openCreate = () => {
    setEditingAsset(null);
    setFormOpen(true);
  };

  const openEdit = (asset: AssetListItem) => {
    setEditingAsset(asset);
    setFormOpen(true);
  };

  const handleQrClose = () => {
    setQrDialogOpen(false);
    setQrInput('');
    setQrError(null);
  };

  const handleQrLookup = async () => {
    const code = qrInput.trim();
    if (!code) return;
    setQrError(null);
    setQrLookupPending(true);
    try {
      const result: QrLookupResult = await assetsApi.lookupByQrCode(code);
      handleQrClose();
      setSelected(result as AssetListItem);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setQrError(axiosErr.response?.status === 404
        ? t('supervisorAssets.qrLookup.notFound')
        : t('supervisorAssets.qrLookup.error'));
    } finally {
      setQrLookupPending(false);
    }
  };

  useEffect(() => {
    if (!qrDialogOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleQrClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrDialogOpen]);

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      { }
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
        { }
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
            placeholder={t('supervisorAssets.filters.searchPlaceholder')}
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

        { }
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as AssetStatus | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorAssets.filters.allStatuses')}</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`supervisorAssets.status.${s}`)}</option>)}
        </select>

        <select
          value={criticalityFilter}
          onChange={(e) => { setCriticalityFilter(e.target.value as AssetCriticality | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorAssets.filters.allCriticalities')}</option>
          {CRITICALITY_OPTIONS.map((c) => <option key={c} value={c}>{t(`supervisorAssets.criticality.${c}`)}</option>)}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorAssets.filters.allCategories')}</option>
          {(categories ?? []).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: 9,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--sb-text-tertiary)',
              padding: '0 2px',
              flexShrink: 0,
            }}
          >
            {t('supervisorAssets.filters.reset')}
          </button>
        )}

        <div style={{ flex: 1 }} />

        {data && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {t('supervisorAssets.total', { count: data.total })}
          </Mono>
        )}

        <button
          type="button"
          onClick={() => { setQrInput(''); setQrError(null); setQrDialogOpen(true); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 9,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            fontWeight: 500,
            color: 'var(--sb-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--sb-border-strong)',
            borderRadius: 2,
            padding: '5px 12px',
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <QrCode size={11} />
          {t('supervisorAssets.qrLookup.button')}
        </button>

        <button
          type="button"
          onClick={openCreate}
          style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
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
          + {t('supervisorAssets.actions.create')}
        </button>
      </div>

      {!isLoading && !isError && !!data?.data.length && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: panelOpen ? '1fr 80px 80px' : '1fr 130px 180px 80px 80px',
            padding: '0 16px',
            height: 28,
            alignItems: 'center',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          <Mono size={8} tracking="0.13em">{t('supervisorAssets.columns.asset')}</Mono>
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('supervisorAssets.columns.category')}</Mono>}
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('supervisorAssets.columns.location')}</Mono>}
          <Mono size={8} tracking="0.13em">{t('supervisorAssets.columns.criticality')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorAssets.columns.status')}</Mono>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('supervisorAssets.states.error')} />
        ) : !data?.data.length ? (
          <TableEmpty label={t('supervisorAssets.states.empty')} />
        ) : (
          data.data.map((asset) => {
            const isSelected = selected?.id === asset.id;
            const statusDot = STATUS_DOT[asset.status as AssetStatus] ?? 'var(--sb-text-tertiary)';
            const critColor = CRITICALITY_COLOR[asset.criticality as AssetCriticality] ?? 'var(--sb-text-secondary)';
            return (
              <div
                key={asset.id}
                onClick={() => setSelected(isSelected ? null : asset)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: panelOpen ? '1fr 80px 80px' : '1fr 130px 180px 80px 80px',
                  padding: '0 16px',
                  height: 44,
                  alignItems: 'center',
                  borderBottom: '1px solid var(--sb-border)',
                  background: isSelected ? 'var(--sb-s-active-bg)' : 'transparent',
                  outline: isSelected ? '1px solid var(--sb-border-strong)' : 'none',
                  outlineOffset: -1,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--sb-hover)'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </div>
                  {asset.serialNumber && (
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.serialNumber}
                    </Mono>
                  )}
                </div>

                {!panelOpen && (
                  <Mono size={10} color="var(--sb-text-secondary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.category.name}
                  </Mono>
                )}

                {!panelOpen && (
                  <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.location.fullPath}
                  </div>
                )}

                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '1px 6px', border: `1px solid ${critColor}44`,
                    borderRadius: 2, fontSize: 9,
                    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                    fontWeight: 600, color: critColor, textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}
                >
                  {t(`supervisorAssets.criticality.${asset.criticality}`)}
                </span>

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot, flexShrink: 0 }} />
                  {!panelOpen && (
                    <Mono size={9} color="var(--sb-text-secondary)">
                      {t(`supervisorAssets.status.${asset.status}`)}
                    </Mono>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          height: 36,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          flexShrink: 0,
        }}
      >
        {data && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {t('supervisorAssets.total', { count: data.total })}
          </Mono>
        )}
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
    <>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <MasterDetail
          list={listContent}
          panel={
            selected ? (
              <AssetDetailPanel
                key={selected.id}
                asset={selected}
                onClose={() => setSelected(null)}
                onEdit={(asset) => { openEdit(asset); }}
              />
            ) : null
          }
          panelOpen={panelOpen}
        />
      </div>

      <AssetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        asset={editingAsset}
        onSuccess={() => setEditingAsset(null)}
      />

      {qrDialogOpen && (
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
          onClick={(e) => { if (e.target === e.currentTarget && !qrLookupPending) handleQrClose(); }}
        >
          <div
            style={{
              background: 'var(--sb-bg)',
              border: '1px solid var(--sb-border)',
              padding: 24,
              width: 360,
            }}
          >

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
                {t('supervisorAssets.qrLookup.dialogTitle')}
              </div>
              <button
                type="button"
                onClick={handleQrClose}
                disabled={qrLookupPending}
                style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}
              >
                <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
              </button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--sb-text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
              {t('supervisorAssets.qrLookup.dialogDescription')}
            </div>

            <div style={{ marginBottom: qrError ? 8 : 20 }}>
              <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 6 }}>
                {t('supervisorAssets.qrLookup.inputLabel')}
              </Mono>
              <input
                id="qr-input"
                value={qrInput}
                onChange={(e) => { setQrInput(e.target.value); setQrError(null); }}
                placeholder={t('supervisorAssets.qrLookup.inputPlaceholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleQrLookup(); } }}
                autoFocus
                style={{
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
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              />
            </div>

            {qrError && (
              <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--sb-p-crit)' }}>
                {qrError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleQrClose}
                disabled={qrLookupPending}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--sb-border-strong)',
                  color: 'var(--sb-text-secondary)',
                  padding: '6px 14px',
                  borderRadius: 2,
                  cursor: qrLookupPending ? 'default' : 'pointer',
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  opacity: qrLookupPending ? 0.5 : 1,
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleQrLookup(); }}
                disabled={qrLookupPending || !qrInput.trim()}
                style={{
                  background: 'var(--sb-text-primary)',
                  border: 'none',
                  color: 'var(--sb-bg)',
                  padding: '6px 14px',
                  borderRadius: 2,
                  cursor: qrLookupPending || !qrInput.trim() ? 'default' : 'pointer',
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  opacity: qrLookupPending || !qrInput.trim() ? 0.5 : 1,
                }}
              >
                {qrLookupPending ? '...' : t('supervisorAssets.qrLookup.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
