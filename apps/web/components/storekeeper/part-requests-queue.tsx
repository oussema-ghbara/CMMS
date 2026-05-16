'use client';

import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { PartRequestRejectionReason, PartRequestStatus } from '@gmao/shared';
import { partRequestsApi } from '@/lib/part-requests.api';
import type { PartRequestQueueItem } from '@/lib/part-requests.api';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Mono } from '@/components/ui/mono';

const LIMIT = 20;

const C = {
  border:      'var(--sb-border)',
  borderStrong:'var(--sb-border-strong)',
  surface:     'var(--sb-surface)',
  hover:       'var(--sb-hover)',
  textPrimary: 'var(--sb-text-primary)',
  textSecondary:'var(--sb-text-secondary)',
  textTertiary:'var(--sb-text-tertiary)',
  sDone:       'var(--sb-s-done)',
  sDoneBg:     'var(--sb-s-done-bg)',
  sWait:       'var(--sb-s-wait)',
  sWaitBg:     'var(--sb-s-wait-bg)',
  sActive:     'var(--sb-s-active)',
  sActiveBg:   'var(--sb-s-active-bg)',
  pCrit:       'var(--sb-p-crit)',
  pCritBg:     'var(--sb-p-crit-bg)',
};

const STATUS_META: Record<PartRequestStatus, { color: string; bg: string; label: string }> = {
  [PartRequestStatus.PENDING]:             { color: C.sWait,   bg: C.sWaitBg,   label: 'EN ATTENTE' },
  [PartRequestStatus.FULFILLED]:           { color: C.sDone,   bg: C.sDoneBg,   label: 'SERVIE' },
  [PartRequestStatus.PARTIALLY_FULFILLED]: { color: C.sActive, bg: C.sActiveBg, label: 'PARTIELLE' },
  [PartRequestStatus.REJECTED]:            { color: C.pCrit,   bg: C.pCritBg,   label: 'REJETÉE' },
};

function RequestStatusPill({ status }: { status: PartRequestStatus }) {
  const { color, bg, label } = STATUS_META[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, border: `1px solid ${color}28`, borderRadius: 2, padding: '2px 7px 2px 5px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      <Mono size={9} color={color} tracking="0.10em">{label}</Mono>
    </span>
  );
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const COL = { date: 160, wo: 180, part: 200, requester: 140, qty: 110, status: 110, actions: 72 };

export function PartRequestsQueue() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PartRequestStatus | ''>('');

  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PartRequestQueueItem | null>(null);

  const [fulfillQuantity, setFulfillQuantity] = useState('');
  const [rejectReason, setRejectReason] = useState<PartRequestRejectionReason>(PartRequestRejectionReason.OUT_OF_STOCK);
  const [rejectDetail, setRejectDetail] = useState('');

  const queryParams = useMemo(
    () => ({ page, limit: LIMIT, ...(statusFilter ? { status: statusFilter } : {}) }),
    [page, statusFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'part-requests', queryParams],
    queryFn: () => partRequestsApi.getQueue(queryParams),
  });

  const fulfillMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity?: number }) =>
      partRequestsApi.fulfill(id, quantity ? { quantity } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'part-requests'] });
      toast.success(t('storekeeperPartRequests.toasts.fulfillSuccess'));
      setFulfillDialogOpen(false);
      setSelectedRequest(null);
      setFulfillQuantity('');
    },
    onError: () => { toast.error(t('storekeeperPartRequests.toasts.fulfillError')); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason, detail }: { id: string; reason: PartRequestRejectionReason; detail?: string }) =>
      partRequestsApi.reject(id, { reason, detail }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'part-requests'] });
      toast.success(t('storekeeperPartRequests.toasts.rejectSuccess'));
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK);
      setRejectDetail('');
    },
    onError: () => { toast.error(t('storekeeperPartRequests.toasts.rejectError')); },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const openFulfillDialog = (request: PartRequestQueueItem) => {
    setSelectedRequest(request);
    setFulfillQuantity(String(request.quantityRequested));
    setFulfillDialogOpen(true);
  };

  const openRejectDialog = (request: PartRequestQueueItem) => {
    setSelectedRequest(request);
    setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK);
    setRejectDetail('');
    setRejectDialogOpen(true);
  };

  const handleFulfill = () => {
    if (!selectedRequest) return;
    const parsed = parseInt(fulfillQuantity, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      toast.error(t('storekeeperPartRequests.toasts.invalidQuantity'));
      return;
    }
    fulfillMutation.mutate({ id: selectedRequest.id, quantity: parsed });
  };

  const handleReject = () => {
    if (!selectedRequest) return;
    rejectMutation.mutate({
      id: selectedRequest.id,
      reason: rejectReason,
      detail: rejectDetail.trim() ? rejectDetail.trim() : undefined,
    });
  };

  const anyDialogOpen = fulfillDialogOpen || rejectDialogOpen;

  useEffect(() => {
    if (!anyDialogOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fulfillDialogOpen && !fulfillMutation.isPending) {
        setFulfillDialogOpen(false);
        setSelectedRequest(null);
        setFulfillQuantity('');
      }
      if (rejectDialogOpen && !rejectMutation.isPending) {
        setRejectDialogOpen(false);
        setSelectedRequest(null);
        setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK);
        setRejectDetail('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyDialogOpen]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mono size={9} color={C.textSecondary} tracking="0.13em">STATUT</Mono>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter((e.target.value as PartRequestStatus) || ''); setPage(1); }}
            style={{ height: 28, border: `1px solid ${C.border}`, borderRadius: 2, padding: '0 8px', fontSize: 12, color: C.textPrimary, background: 'var(--sb-bg)', outline: 'none' }}
          >
            <option value="">{t('storekeeperPartRequests.filters.allStatuses')}</option>
            <option value={PartRequestStatus.PENDING}>{t('storekeeperPartRequests.status.PENDING')}</option>
            <option value={PartRequestStatus.FULFILLED}>{t('storekeeperPartRequests.status.FULFILLED')}</option>
            <option value={PartRequestStatus.PARTIALLY_FULFILLED}>{t('storekeeperPartRequests.status.PARTIALLY_FULFILLED')}</option>
            <option value={PartRequestStatus.REJECTED}>{t('storekeeperPartRequests.status.REJECTED')}</option>
          </select>
        </div>
        {data && (
          <Mono size={9} color={C.textTertiary} tracking="0.10em">
            {data.total} DEMANDE{data.total !== 1 ? 'S' : ''}
          </Mono>
        )}
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 2, overflow: 'hidden', background: 'var(--sb-bg)' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: `${COL.date}px ${COL.wo}px 1fr ${COL.requester}px ${COL.qty}px ${COL.status}px ${COL.actions}px`, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 12px' }}>
          {[
            t('storekeeperPartRequests.columns.createdAt'),
            t('storekeeperPartRequests.columns.workOrder'),
            t('storekeeperPartRequests.columns.part'),
            t('storekeeperPartRequests.columns.requester'),
            t('storekeeperPartRequests.columns.quantity'),
            t('storekeeperPartRequests.columns.status'),
            t('common.actions'),
          ].map((col, i) => (
            <div key={i} style={{ padding: '9px 0', textAlign: i === 6 ? 'right' : 'left' }}>
              <Mono size={9} color={C.textSecondary} tracking="0.13em">{col.toUpperCase()}</Mono>
            </div>
          ))}
        </div>

        {/* Body */}
        {isLoading ? (
          <TableLoading />
        ) : isError ? (
          <TableError label={t('storekeeperPartRequests.states.error')} />
        ) : !data || data.data.length === 0 ? (
          <TableEmpty label={t('storekeeperPartRequests.states.empty')} />
        ) : (
          data.data.map((request, idx) => (
            <div
              key={request.id}
              style={{
                display: 'grid',
                gridTemplateColumns: `${COL.date}px ${COL.wo}px 1fr ${COL.requester}px ${COL.qty}px ${COL.status}px ${COL.actions}px`,
                borderTop: idx === 0 ? 'none' : `1px solid ${C.border}`,
                padding: '0 12px',
                alignItems: 'center',
                minHeight: 44,
              }}
            >
              {/* Date */}
              <div style={{ padding: '10px 0' }}>
                <Mono size={10} color={C.textTertiary} tracking="0.08em">
                  {formatDateTime(request.createdAt)}
                </Mono>
              </div>

              {/* Work Order */}
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 11, fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontWeight: 600, color: C.textPrimary, letterSpacing: '0.05em' }}>
                  {request.workOrder.referenceNumber}
                </div>
                <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>
                  {request.workOrder.asset?.name ?? t('storekeeperPartRequests.labels.noAsset')}
                </div>
              </div>

              {/* Part */}
              <div style={{ padding: '10px 8px 10px 0' }}>
                {request.part ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{request.part.name}</div>
                    <Mono size={9} color={C.textTertiary} tracking="0.08em" style={{ marginTop: 2 }}>
                      {request.part.referenceCode}
                    </Mono>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: C.textSecondary }}>
                    {request.offCatalogDescription ?? t('storekeeperPartRequests.labels.offCatalogUnknown')}
                  </div>
                )}
              </div>

              {/* Requester */}
              <div style={{ padding: '10px 0', fontSize: 12, color: C.textSecondary }}>{request.requester.name}</div>

              {/* Quantity */}
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>
                  {t('storekeeperPartRequests.labels.quantityRequested', { value: request.quantityRequested })}
                </div>
                {request.status !== PartRequestStatus.PENDING && (
                  <Mono size={9} color={C.textTertiary} tracking="0.08em" style={{ marginTop: 2 }}>
                    {t('storekeeperPartRequests.labels.quantityFulfilled', { value: request.quantityFulfilled })}
                  </Mono>
                )}
              </div>

              {/* Status */}
              <div style={{ padding: '10px 0' }}>
                <RequestStatusPill status={request.status} />
              </div>

              {/* Actions */}
              <div style={{ padding: '10px 0', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                {request.status === PartRequestStatus.PENDING && (
                  <>
                    <button
                      title={t('storekeeperPartRequests.actions.fulfill')}
                      onClick={() => openFulfillDialog(request)}
                      style={{ width: 26, height: 26, border: `1px solid ${C.sDone}40`, borderRadius: 2, background: C.sDoneBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Check style={{ width: 12, height: 12, color: C.sDone }} />
                    </button>
                    <button
                      title={t('storekeeperPartRequests.actions.reject')}
                      onClick={() => openRejectDialog(request)}
                      style={{ width: 26, height: 26, border: `1px solid ${C.pCrit}40`, borderRadius: 2, background: C.pCritBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X style={{ width: 12, height: 12, color: C.pCrit }} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />

      {/* Fulfill Modal */}
      {fulfillDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget && !fulfillMutation.isPending) { setFulfillDialogOpen(false); setSelectedRequest(null); setFulfillQuantity(''); } }}
        >
          <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 400 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
                {t('storekeeperPartRequests.fulfillDialog.title')}
              </div>
              <button
                type="button"
                onClick={() => { setFulfillDialogOpen(false); setSelectedRequest(null); setFulfillQuantity(''); }}
                disabled={fulfillMutation.isPending}
                style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}
              >
                <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--sb-text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
              {t('storekeeperPartRequests.fulfillDialog.description')}
            </div>
            <div style={{ marginBottom: 20 }}>
              <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 6 }}>
                {t('storekeeperPartRequests.fulfillDialog.quantity')}
              </Mono>
              <input
                id="fulfill-quantity"
                type="number"
                min={1}
                value={fulfillQuantity}
                onChange={(e) => setFulfillQuantity(e.target.value)}
                autoFocus
                style={{
                  width: '100%', height: 34, padding: '0 10px',
                  border: '1px solid var(--sb-border)', borderRadius: 2,
                  fontFamily: 'inherit', fontSize: 13,
                  color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setFulfillDialogOpen(false); setSelectedRequest(null); setFulfillQuantity(''); }}
                disabled={fulfillMutation.isPending}
                style={{ background: 'transparent', border: '1px solid var(--sb-border-strong)', color: 'var(--sb-text-secondary)', padding: '6px 14px', borderRadius: 2, cursor: fulfillMutation.isPending ? 'default' : 'pointer', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, opacity: fulfillMutation.isPending ? 0.5 : 1 }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleFulfill}
                disabled={fulfillMutation.isPending}
                style={{ background: C.sDone, border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 2, cursor: fulfillMutation.isPending ? 'default' : 'pointer', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, opacity: fulfillMutation.isPending ? 0.75 : 1 }}
              >
                {fulfillMutation.isPending ? '...' : t('storekeeperPartRequests.actions.fulfill')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget && !rejectMutation.isPending) { setRejectDialogOpen(false); setSelectedRequest(null); setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK); setRejectDetail(''); } }}
        >
          <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 400 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
                {t('storekeeperPartRequests.rejectDialog.title')}
              </div>
              <button
                type="button"
                onClick={() => { setRejectDialogOpen(false); setSelectedRequest(null); setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK); setRejectDetail(''); }}
                disabled={rejectMutation.isPending}
                style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}
              >
                <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--sb-text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
              {t('storekeeperPartRequests.rejectDialog.description')}
            </div>
            <div style={{ marginBottom: 12 }}>
              <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 6 }}>
                {t('storekeeperPartRequests.rejectDialog.reason')}
              </Mono>
              <select
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value as PartRequestRejectionReason)}
                style={{ width: '100%', height: 34, padding: '0 8px', border: '1px solid var(--sb-border)', borderRadius: 2, fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sb-text-secondary)', background: 'var(--sb-bg)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              >
                <option value={PartRequestRejectionReason.OUT_OF_STOCK}>{t('storekeeperPartRequests.rejectionReason.OUT_OF_STOCK')}</option>
                <option value={PartRequestRejectionReason.NOT_APPLICABLE}>{t('storekeeperPartRequests.rejectionReason.NOT_APPLICABLE')}</option>
                <option value={PartRequestRejectionReason.INCORRECT_REQUEST}>{t('storekeeperPartRequests.rejectionReason.INCORRECT_REQUEST')}</option>
                <option value={PartRequestRejectionReason.OTHER}>{t('storekeeperPartRequests.rejectionReason.OTHER')}</option>
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 6 }}>
                {t('storekeeperPartRequests.rejectDialog.detail')}
              </Mono>
              <input
                id="reject-detail"
                value={rejectDetail}
                onChange={(e) => setRejectDetail(e.target.value)}
                maxLength={500}
                style={{
                  width: '100%', height: 34, padding: '0 10px',
                  border: '1px solid var(--sb-border)', borderRadius: 2,
                  fontFamily: 'inherit', fontSize: 13,
                  color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setRejectDialogOpen(false); setSelectedRequest(null); setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK); setRejectDetail(''); }}
                disabled={rejectMutation.isPending}
                style={{ background: 'transparent', border: '1px solid var(--sb-border-strong)', color: 'var(--sb-text-secondary)', padding: '6px 14px', borderRadius: 2, cursor: rejectMutation.isPending ? 'default' : 'pointer', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, opacity: rejectMutation.isPending ? 0.5 : 1 }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                style={{ background: C.pCrit, border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 2, cursor: rejectMutation.isPending ? 'default' : 'pointer', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, opacity: rejectMutation.isPending ? 0.75 : 1 }}
              >
                {rejectMutation.isPending ? '...' : t('storekeeperPartRequests.actions.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
