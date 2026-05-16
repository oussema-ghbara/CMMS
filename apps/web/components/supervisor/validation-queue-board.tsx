'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@gmao/shared';
import { workOrdersApi, type WorkOrderListItem } from '@/lib/work-orders.api';
import { useAuthStore } from '@/store/auth.store';
import { MasterDetail } from '@/components/ui/master-detail';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { PriorityChip } from '@/components/ui/priority-chip';
import { TypeBadge } from '@/components/ui/type-badge';
import { Mono } from '@/components/ui/mono';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { WorkOrderDetailPanel } from './work-order-detail-panel';

const LIMIT = 20;

const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'var(--sb-p-crit)',
  [WorkOrderPriority.HIGH]:     'var(--sb-p-high)',
  [WorkOrderPriority.MEDIUM]:   'var(--sb-p-norm)',
  [WorkOrderPriority.LOW]:      'var(--sb-p-low)',
};

function formatElapsed(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

function getPrincipalName(item: WorkOrderListItem, fallback: string): string {
  if (item.principalTechnician?.name) return item.principalTechnician.name;
  const principal = item.assignments.find((a) => a.isPrincipal);
  return principal?.technician.name ?? fallback;
}

export function ValidationQueueBoard() {
  const { t } = useTranslation();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WorkOrderListItem | null>(null);

  const queryParams = { page, limit: LIMIT, status: WorkOrderStatus.PENDING_VALIDATION };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'validation-queue', queryParams],
    queryFn: () => workOrdersApi.list(queryParams),
    enabled: isInitialized,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header strip */}
      <div
        style={{
          padding: '0 16px',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          flexShrink: 0,
        }}
      >
        <Mono size={9} tracking="0.13em">
          {isLoading
            ? t('common.loading')
            : t('validationQueue.total', { count: data?.total ?? 0 })}
        </Mono>
      </div>

      {/* Column headers */}
      {!isLoading && !isError && !!data?.data.length && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: selected
              ? '140px 1fr 130px 80px 32px'
              : '140px 1fr 160px 120px 80px 32px',
            padding: '0 16px',
            height: 28,
            alignItems: 'center',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          <Mono size={8} tracking="0.13em">{t('validationQueue.columns.reference')}</Mono>
          <Mono size={8} tracking="0.13em">{t('validationQueue.columns.asset')}</Mono>
          {!selected && <Mono size={8} tracking="0.13em">{t('validationQueue.columns.technician')}</Mono>}
          <Mono size={8} tracking="0.13em">{t('validationQueue.columns.type')}</Mono>
          {!selected && <Mono size={8} tracking="0.13em">{t('validationQueue.columns.priority')}</Mono>}
          <Mono size={8} tracking="0.13em">{t('validationQueue.columns.inQueueSince')}</Mono>
          <span />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('validationQueue.states.error')} />
        ) : !data?.data.length ? (
          <TableEmpty label={t('validationQueue.states.empty')} />
        ) : (
          data.data.map((wo) => {
            const isSelected = selected?.id === wo.id;
            return (
              <div
                key={wo.id}
                onClick={() => setSelected(isSelected ? null : wo)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: selected
                    ? '140px 1fr 130px 80px 32px'
                    : '140px 1fr 160px 120px 80px 32px',
                  padding: '0 16px',
                  height: 40,
                  alignItems: 'center',
                  borderBottom: '1px solid var(--sb-border)',
                  borderLeft: `3px solid ${PRIORITY_COLOR[wo.priority]}`,
                  background: isSelected ? 'var(--sb-s-active-bg)' : 'transparent',
                  outline: isSelected ? '1px solid var(--sb-border-strong)' : 'none',
                  outlineOffset: -1,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--sb-hover)'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <Mono size={11} color="var(--sb-text-primary)" weight={600} tracking="0.06em">
                  {wo.referenceNumber}
                </Mono>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {wo.asset.name}
                  </div>
                  {wo.asset.location?.fullPath && (
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wo.asset.location.fullPath}
                    </Mono>
                  )}
                </div>
                {!selected && (
                  <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getPrincipalName(wo, t('supervisorWorkOrders.labels.unassigned'))}
                  </div>
                )}
                <TypeBadge type={wo.type as WorkOrderType} />
                {!selected && <PriorityChip priority={wo.priority as WorkOrderPriority} />}
                <Mono size={10} color="var(--sb-text-secondary)">
                  {formatElapsed(wo.updatedAt)}
                </Mono>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: pagination */}
      <div
        style={{
          padding: '0 16px',
          height: 36,
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
            {t('validationQueue.total', { count: data.total })}
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MasterDetail
        list={listContent}
        panel={
          selected ? (
            <WorkOrderDetailPanel
              key={selected.id}
              workOrder={selected}
              onClose={() => setSelected(null)}
            />
          ) : null
        }
        panelOpen={!!selected}
      />
    </div>
  );
}
