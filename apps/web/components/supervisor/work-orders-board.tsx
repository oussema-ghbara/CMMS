'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@gmao/shared';
import { workOrdersApi, type WorkOrderListItem } from '@/lib/work-orders.api';
import { MasterDetail } from '@/components/ui/master-detail';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { StatusPill } from '@/components/ui/status-pill';
import { TypeBadge } from '@/components/ui/type-badge';
import { Mono } from '@/components/ui/mono';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { WorkOrderFormDialog } from './work-order-form-dialog';
import { WorkOrderDetailPanel } from './work-order-detail-panel';
import { useAuthStore } from '@/store/auth.store';

const LIMIT = 20;

const STATUS_OPTIONS = [
  WorkOrderStatus.DRAFT,
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.CANCELLED,
] as const;

const TYPE_OPTIONS = [WorkOrderType.CORRECTIVE, WorkOrderType.PREVENTIVE] as const;

const PRIORITY_OPTIONS = [
  WorkOrderPriority.CRITICAL,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.LOW,
] as const;

const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'var(--sb-p-crit)',
  [WorkOrderPriority.HIGH]:     'var(--sb-p-high)',
  [WorkOrderPriority.MEDIUM]:   'var(--sb-p-norm)',
  [WorkOrderPriority.LOW]:      'var(--sb-p-low)',
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

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--sb-surface)',
      border: '1px solid var(--sb-border-strong)',
      borderRadius: 2,
      padding: '2px 4px 2px 8px',
      flexShrink: 0,
    }}>
      <Mono size={9} color="var(--sb-text-secondary)">{label}</Mono>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          color: 'var(--sb-text-tertiary)',
          lineHeight: 1,
          fontSize: 11,
        }}
      >×</button>
    </span>
  );
}

function formatElapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

function getPrincipalName(item: WorkOrderListItem, fallback: string): string {
  if (item.principalTechnician?.name) return item.principalTechnician.name;
  const principal = item.assignments.find((a) => a.isPrincipal);
  return principal?.technician.name ?? fallback;
}

export function WorkOrdersBoard() {
  const { t } = useTranslation();
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const [type, setType] = useState<WorkOrderType | ''>('');
  const [priority, setPriority] = useState<WorkOrderPriority | ''>('');

  const technicianId = searchParams.get('technicianId') ?? undefined;
  const isOverdue = searchParams.get('isOverdue') === 'true' || undefined;
  const isActive = searchParams.get('isActive') === 'true' || undefined;
  const statusParam = searchParams.get('status') as WorkOrderStatus | null;

  useEffect(() => {
    if (statusParam && Object.values(WorkOrderStatus).includes(statusParam)) {
      setStatus(statusParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderListItem | { id: string } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const deepLinkId = searchParams.get('id');
  useEffect(() => {
    if (!deepLinkId || !isInitialized) return;
    setSelectedWorkOrder({ id: deepLinkId });
    router.replace('/supervisor/work-orders', { scroll: false });
  }, [deepLinkId, isInitialized, router]);

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(technicianId ? { technicianId } : {}),
      ...(isOverdue ? { isOverdue } : {}),
      ...(isActive ? { isActive } : {}),
    }),
    [page, search, status, type, priority, technicianId, isOverdue, isActive],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'work-orders', queryParams],
    queryFn: () => workOrdersApi.list(queryParams),
    enabled: isInitialized,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const panelOpen = selectedWorkOrder !== null;

  const handleCommitSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setType('');
    setPriority('');
    setPage(1);
    if (technicianId || isOverdue || isActive || statusParam) {
      router.replace('/supervisor/work-orders', { scroll: false });
    }
  };

  const hasActiveFilters = !!(searchInput || search || status || type || priority || technicianId || isActive || isOverdue);

  // ── Column layout ──────────────────────────────────────────────────────────

  const colTemplate = panelOpen
    ? '100px 1fr 96px 130px 60px'
    : '100px 1fr 96px 130px 140px 60px';

  // ── List column ────────────────────────────────────────────────────────────

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
        {/* Search */}
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
            placeholder={t('supervisorWorkOrders.filters.searchPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCommitSearch(); } }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            style={{
              height: 26,
              paddingLeft: 26,
              paddingRight: 8,
              width: 190,
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

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as WorkOrderStatus | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorWorkOrders.filters.allStatuses')}</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{t(`supervisorWorkOrders.status.${opt}`)}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={type}
          onChange={(e) => { setType(e.target.value as WorkOrderType | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorWorkOrders.filters.allTypes')}</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{t(`supervisorWorkOrders.types.${opt}`)}</option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value as WorkOrderPriority | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorWorkOrders.filters.allPriorities')}</option>
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{t(`supervisorWorkOrders.priority.${opt}`)}</option>
          ))}
        </select>

        {/* URL-driven filter tags */}
        {technicianId && (
          <FilterTag
            label={t('supervisorWorkOrders.filters.technicianFilter')}
            onRemove={() => router.replace('/supervisor/work-orders', { scroll: false })}
          />
        )}
        {isActive && (
          <FilterTag
            label={t('supervisorWorkOrders.filters.activeFilter')}
            onRemove={() => router.replace('/supervisor/work-orders', { scroll: false })}
          />
        )}

        {/* Reset — only when filters are active */}
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
            {t('supervisorWorkOrders.filters.reset')}
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Count */}
        {data && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {t('supervisorWorkOrders.total', { count: data.total })}
          </Mono>
        )}

        {/* Create button */}
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
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
          + {t('supervisorWorkOrders.actions.create')}
        </button>
      </div>

      {/* Column headers */}
      {!isLoading && !isError && !!data?.data.length && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            paddingLeft: 19,
            paddingRight: 16,
            height: 28,
            alignItems: 'center',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          <Mono size={8} tracking="0.13em">{t('supervisorWorkOrders.columns.reference')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorWorkOrders.columns.asset')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorWorkOrders.columns.type')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorWorkOrders.columns.status')}</Mono>
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('supervisorWorkOrders.columns.technician')}</Mono>}
          <Mono size={8} tracking="0.13em">{t('supervisorWorkOrders.columns.createdAt')}</Mono>
        </div>
      )}

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('supervisorWorkOrders.states.error')} />
        ) : !data || data.data.length === 0 ? (
          <TableEmpty label={t('supervisorWorkOrders.states.empty')} />
        ) : (
          data.data.map((item) => {
            const isTerminal =
              item.status === WorkOrderStatus.CLOSED || item.status === WorkOrderStatus.CANCELLED;
            const isRowOverdue =
              !isTerminal && !!item.dueDate && new Date(item.dueDate) < new Date();
            const isSelected =
              selectedWorkOrder !== null && selectedWorkOrder.id === item.id;

            const baseBackground = isRowOverdue ? 'rgba(181,53,37,0.04)' : 'transparent';

            return (
              <div
                key={item.id}
                onClick={() => setSelectedWorkOrder(isSelected ? null : item)}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--sb-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = baseBackground;
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: colTemplate,
                  paddingRight: 16,
                  height: 44,
                  alignItems: 'center',
                  borderLeft: `3px solid ${PRIORITY_COLOR[item.priority]}`,
                  borderBottom: '1px solid var(--sb-border)',
                  outline: isSelected ? '1px solid var(--sb-border-strong)' : 'none',
                  outlineOffset: -1,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--sb-s-active-bg)' : baseBackground,
                  transition: 'background 0.1s',
                }}
              >
                {/* Reference */}
                <div style={{ paddingLeft: 13, paddingRight: 12, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mono size={10} color="var(--sb-text-primary)" tracking="0.06em" weight={600}>
                      {item.referenceNumber}
                    </Mono>
                    {isRowOverdue && (
                      <span style={{ color: 'var(--sb-p-crit)', fontSize: 8, lineHeight: 1 }}>▲</span>
                    )}
                  </div>
                </div>

                {/* Asset + location */}
                <div style={{ padding: '0 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.asset?.name ?? t('common.noData')}
                  </div>
                  {item.asset?.location?.fullPath && (
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.asset.location.fullPath}
                    </Mono>
                  )}
                </div>

                {/* Type */}
                <div style={{ padding: '0 12px' }}>
                  <TypeBadge type={item.type} />
                </div>

                {/* Status */}
                <div style={{ padding: '0 12px' }}>
                  <StatusPill status={item.status} />
                </div>

                {/* Technician (hidden when panel open) */}
                {!panelOpen && (
                  <div style={{ padding: '0 12px', minWidth: 0 }}>
                    <span style={{
                      fontSize: 12,
                      color: 'var(--sb-text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                    }}>
                      {getPrincipalName(item, t('supervisorWorkOrders.labels.unassigned'))}
                    </span>
                  </div>
                )}

                {/* Elapsed */}
                <div style={{ padding: '0 12px' }}>
                  <Mono size={10} color="var(--sb-text-secondary)">
                    {formatElapsed(item.createdAt)}
                  </Mono>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: priority legend + pagination */}
      <div
        style={{
          height: 36,
          padding: '0 16px',
          borderTop: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        {PRIORITY_OPTIONS.map((p) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderLeft: `3px solid ${PRIORITY_COLOR[p]}` }} />
            <Mono size={8} color="var(--sb-text-tertiary)">{t(`supervisorWorkOrders.priority.${p}`)}</Mono>
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>
    </div>
  );

  // ── Panel column ───────────────────────────────────────────────────────────

  const panelContent = selectedWorkOrder ? (
    <WorkOrderDetailPanel
      key={selectedWorkOrder.id}
      workOrder={selectedWorkOrder}
      onClose={() => setSelectedWorkOrder(null)}
    />
  ) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <MasterDetail list={listContent} panel={panelContent} panelOpen={panelOpen} />
      </div>

      <WorkOrderFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
