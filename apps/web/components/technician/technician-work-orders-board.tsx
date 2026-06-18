'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@gmao/shared';
import { workOrdersApi, type WorkOrderListItem } from '@/lib/work-orders.api';
import { useAuthStore } from '@/store/auth.store';
import { MasterDetail } from '@/components/ui/master-detail';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { StatusPill } from '@/components/ui/status-pill';
import { TypeBadge } from '@/components/ui/type-badge';
import { Mono } from '@/components/ui/mono';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { TechnicianWorkOrderDetailPanel } from './work-order-detail-panel';

const LIMIT = 20;

const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'var(--sb-p-crit)',
  [WorkOrderPriority.HIGH]:     'var(--sb-p-high)',
  [WorkOrderPriority.MEDIUM]:   'var(--sb-p-norm)',
  [WorkOrderPriority.LOW]:      'var(--sb-p-low)',
};

const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'Critique',
  [WorkOrderPriority.HIGH]:     'Haute',
  [WorkOrderPriority.MEDIUM]:   'Normale',
  [WorkOrderPriority.LOW]:      'Basse',
};

const STATUS_OPTIONS = [
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
  WorkOrderStatus.CLOSED,
] as const;

const STATUS_LABEL: Partial<Record<WorkOrderStatus, string>> = {
  [WorkOrderStatus.ASSIGNED]:           'Assigné',
  [WorkOrderStatus.IN_PROGRESS]:        'En cours',
  [WorkOrderStatus.ON_HOLD]:            'En attente',
  [WorkOrderStatus.PENDING_VALIDATION]: 'Validation',
  [WorkOrderStatus.CLOSED]:             'Terminé',
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

function formatElapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

export function TechnicianWorkOrdersBoard() {
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');

  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderListItem | { id: string } | null>(null);
  const panelOpen = selectedWorkOrder !== null;

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      technicianId: user?.id,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
    }),
    [page, search, status, user?.id],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['technician', 'work-orders', queryParams],
    queryFn: () => workOrdersApi.list(queryParams),
    enabled: isInitialized && !!user?.id,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const handleCommitSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  };

  const hasActiveFilters = !!(searchInput || search || status);

  const colTemplate = panelOpen
    ? '100px 1fr 96px 130px 60px'
    : '100px 1fr 96px 130px 60px';

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

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
            placeholder="Rechercher..."
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

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as WorkOrderStatus | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{STATUS_LABEL[opt]}</option>
          ))}
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
            Réinitialiser
          </button>
        )}

        <div style={{ flex: 1 }} />

        {data && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {data.total} bon{data.total !== 1 ? 's' : ''} de travail
          </Mono>
        )}
      </div>

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
          <Mono size={8} tracking="0.13em">Référence</Mono>
          <Mono size={8} tracking="0.13em">Équipement</Mono>
          <Mono size={8} tracking="0.13em">Type</Mono>
          <Mono size={8} tracking="0.13em">Statut</Mono>
          <Mono size={8} tracking="0.13em">Âge</Mono>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label="Chargement..." />
        ) : isError ? (
          <TableError label="Erreur lors du chargement des bons de travail." />
        ) : !data || data.data.length === 0 ? (
          <TableEmpty label="Aucun bon de travail assigné." />
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

                <div style={{ padding: '0 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.asset?.name ?? '—'}
                  </div>
                  {item.asset?.location?.fullPath && (
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.asset.location.fullPath}
                    </Mono>
                  )}
                </div>

                <div style={{ padding: '0 12px' }}>
                  <TypeBadge type={item.type} />
                </div>

                <div style={{ padding: '0 12px' }}>
                  <StatusPill status={item.status} />
                </div>

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
        {Object.values(WorkOrderPriority).map((p) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderLeft: `3px solid ${PRIORITY_COLOR[p]}` }} />
            <Mono size={8} color="var(--sb-text-tertiary)">{PRIORITY_LABEL[p]}</Mono>
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

  const panelContent = selectedWorkOrder ? (
    <TechnicianWorkOrderDetailPanel
      key={selectedWorkOrder.id}
      workOrderId={selectedWorkOrder.id}
      onClose={() => setSelectedWorkOrder(null)}
    />
  ) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MasterDetail list={listContent} panel={panelContent} panelOpen={panelOpen} />
    </div>
  );
}
