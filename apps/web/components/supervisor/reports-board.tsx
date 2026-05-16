'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, Search } from 'lucide-react';
import {
  ProblemReportStatus,
  ReportArchiveReason,
  ReportRejectionReason,
  UrgencyPerception,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@gmao/shared';
import {
  reportsApi,
  type ReportListItem,
  type ReportAssetActiveWO,
  type ReportAssetCertAlert,
  type ReportAssetInterventionHistoryItem,
} from '@/lib/reports.api';
import { useTranslation } from 'react-i18next';
import { MasterDetail } from '@/components/ui/master-detail';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Mono } from '@/components/ui/mono';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';

// ── Constants ──────────────────────────────────────────────────────────────────

const LIMIT = 20;
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const STATUS_OPTIONS = [
  ProblemReportStatus.PENDING,
  ProblemReportStatus.CONVERTED,
  ProblemReportStatus.REJECTED,
  ProblemReportStatus.DEFERRED,
  ProblemReportStatus.ARCHIVED,
] as const;

const URGENCY_OPTIONS = [
  UrgencyPerception.MACHINE_STOPPED,
  UrgencyPerception.ABNORMAL_BEHAVIOR,
  UrgencyPerception.MINOR_ISSUE,
] as const;

const PRIORITY_OPTIONS = [
  WorkOrderPriority.CRITICAL,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.LOW,
] as const;

const REJECTION_REASON_OPTIONS = [
  ReportRejectionReason.INVALID_REPORT,
  ReportRejectionReason.UNSUPPORTED_EQUIPMENT,
  ReportRejectionReason.ALREADY_ADDRESSED,
  ReportRejectionReason.DUPLICATE_EXISTING_WO,
  ReportRejectionReason.OUT_OF_MAINTENANCE_SCOPE,
] as const;

const ARCHIVE_REASON_OPTIONS = [
  ReportArchiveReason.RESOLVED_SPONTANEOUSLY,
  ReportArchiveReason.EQUIPMENT_DECOMMISSIONED,
  ReportArchiveReason.SUBMITTED_IN_ERROR,
  ReportArchiveReason.REPLACED_BY_OTHER_WO,
  ReportArchiveReason.MANAGEMENT_DECISION,
] as const;

// ── Color maps ─────────────────────────────────────────────────────────────────

const URGENCY_BORDER: Record<UrgencyPerception, string> = {
  [UrgencyPerception.MACHINE_STOPPED]:   'var(--sb-p-crit)',
  [UrgencyPerception.ABNORMAL_BEHAVIOR]: 'var(--sb-p-high)',
  [UrgencyPerception.MINOR_ISSUE]:       'var(--sb-p-low)',
};

const URGENCY_COLOR: Record<UrgencyPerception, string> = {
  [UrgencyPerception.MACHINE_STOPPED]:   'var(--sb-p-crit)',
  [UrgencyPerception.ABNORMAL_BEHAVIOR]: 'var(--sb-p-high)',
  [UrgencyPerception.MINOR_ISSUE]:       'var(--sb-p-low)',
};

const URGENCY_BG: Record<UrgencyPerception, string> = {
  [UrgencyPerception.MACHINE_STOPPED]:   'var(--sb-p-crit-bg)',
  [UrgencyPerception.ABNORMAL_BEHAVIOR]: 'var(--sb-p-high-bg)',
  [UrgencyPerception.MINOR_ISSUE]:       'var(--sb-p-low-bg)',
};

const REPORT_STATUS_COLOR: Record<ProblemReportStatus, string> = {
  [ProblemReportStatus.PENDING]:   'var(--sb-s-active)',
  [ProblemReportStatus.CONVERTED]: 'var(--sb-s-done)',
  [ProblemReportStatus.REJECTED]:  'var(--sb-p-crit)',
  [ProblemReportStatus.DEFERRED]:  'var(--sb-s-wait)',
  [ProblemReportStatus.ARCHIVED]:  'var(--sb-s-cancel)',
};

const REPORT_STATUS_BG: Record<ProblemReportStatus, string> = {
  [ProblemReportStatus.PENDING]:   'var(--sb-s-active-bg)',
  [ProblemReportStatus.CONVERTED]: 'var(--sb-s-done-bg)',
  [ProblemReportStatus.REJECTED]:  'var(--sb-p-crit-bg)',
  [ProblemReportStatus.DEFERRED]:  'var(--sb-s-wait-bg)',
  [ProblemReportStatus.ARCHIVED]:  'var(--sb-s-cancel-bg)',
};

const WO_STATUS_COLOR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:              'var(--sb-s-cancel)',
  [WorkOrderStatus.OPEN]:               'var(--sb-s-open)',
  [WorkOrderStatus.ASSIGNED]:           'var(--sb-s-active)',
  [WorkOrderStatus.IN_PROGRESS]:        'var(--sb-s-active)',
  [WorkOrderStatus.ON_HOLD]:            'var(--sb-s-wait)',
  [WorkOrderStatus.PENDING_VALIDATION]: 'var(--sb-s-wait)',
  [WorkOrderStatus.CLOSED]:             'var(--sb-s-done)',
  [WorkOrderStatus.CANCELLED]:          'var(--sb-s-cancel)',
};

const WO_STATUS_BG: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:              'var(--sb-s-cancel-bg)',
  [WorkOrderStatus.OPEN]:               'var(--sb-s-open-bg)',
  [WorkOrderStatus.ASSIGNED]:           'var(--sb-s-active-bg)',
  [WorkOrderStatus.IN_PROGRESS]:        'var(--sb-s-active-bg)',
  [WorkOrderStatus.ON_HOLD]:            'var(--sb-s-wait-bg)',
  [WorkOrderStatus.PENDING_VALIDATION]: 'var(--sb-s-wait-bg)',
  [WorkOrderStatus.CLOSED]:             'var(--sb-s-done-bg)',
  [WorkOrderStatus.CANCELLED]:          'var(--sb-s-cancel-bg)',
};

// ── Style constants ────────────────────────────────────────────────────────────

const inputS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 12,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectS: React.CSSProperties = {
  ...inputS,
  padding: '0 4px 0 8px',
  cursor: 'pointer',
};

const textareaS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 12,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
  boxSizing: 'border-box',
  resize: 'vertical',
  minHeight: 72,
  lineHeight: 1.6,
};

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

const actionBlockStyle: React.CSSProperties = {
  border: '1px solid var(--sb-border)',
  padding: '12px 14px',
  background: 'var(--sb-surface)',
  marginBottom: 8,
};

function btnPrimaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
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
    gap: 6,
    background: 'transparent',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    border: '1px solid var(--sb-border)',
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

function btnDestructiveStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: disabled ? 'var(--sb-border)' : 'var(--sb-p-crit)',
    color: disabled ? 'var(--sb-text-tertiary)' : '#fff',
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

// ── Utilities ──────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

function getDeferredAgingInfo(deferredAt: string | null): { label: string; color: string } | null {
  if (!deferredAt) return null;
  const elapsedHours = (Date.now() - new Date(deferredAt).getTime()) / 3_600_000;
  if (elapsedHours >= 336) return { label: 'tier14d', color: 'var(--sb-p-crit)' };
  if (elapsedHours >= 168) return { label: 'tier7d', color: 'var(--sb-p-high)' };
  if (elapsedHours >= 48)  return { label: 'tier48h', color: 'var(--sb-s-active)' };
  return null;
}

// ── Atom components ────────────────────────────────────────────────────────────

function ReportStatusPill({ status }: { status: ProblemReportStatus }) {
  const color = REPORT_STATUS_COLOR[status];
  const bg    = REPORT_STATUS_BG[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: bg,
        border: `1px solid ${color}28`,
        borderRadius: 2,
        padding: '2px 7px 2px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <Mono size={9} color={color} tracking="0.10em">{status}</Mono>
    </span>
  );
}

function UrgencyPill({ urgency }: { urgency: UrgencyPerception }) {
  const color = URGENCY_COLOR[urgency];
  const bg    = URGENCY_BG[urgency];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: bg,
        border: `1px solid ${color}28`,
        borderRadius: 2,
        padding: '2px 7px 2px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <Mono size={9} color={color} tracking="0.10em">{urgency}</Mono>
    </span>
  );
}

function WOStatusPill({ status }: { status: WorkOrderStatus }) {
  const color = WO_STATUS_COLOR[status];
  const bg    = WO_STATUS_BG[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: bg,
        border: `1px solid ${color}28`,
        borderRadius: 2,
        padding: '1px 6px 1px 4px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      <Mono size={8} color={color} tracking="0.10em">{status}</Mono>
    </span>
  );
}

export function DuplicateSubmissionBadge({
  submittedDespiteWarning,
}: {
  submittedDespiteWarning: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!submittedDespiteWarning) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--sb-s-active-bg)',
        border: '1px solid var(--sb-s-active)',
        borderRadius: 2,
        padding: '2px 6px',
        fontFamily: MONO,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--sb-s-active)',
        whiteSpace: 'nowrap',
      }}
    >
      {t('supervisorReports.labels.submittedDespiteWarning')}
    </span>
  );
}

// ── Report Detail Panel ────────────────────────────────────────────────────────

type ActionPanel = 'convert' | 'reject' | 'defer' | 'archive' | 'reopen' | null;
type PanelTab = 'detail' | 'actions';

function ReportDetailPanel({
  reportSummary,
  onClose,
}: {
  reportSummary: ReportListItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<PanelTab>('detail');
  const [activeAction, setActiveAction] = useState<ActionPanel>(null);

  const [commentContent, setCommentContent] = useState('');
  const [convertPriority, setConvertPriority] = useState<WorkOrderPriority>(WorkOrderPriority.MEDIUM);
  const [convertDescription, setConvertDescription] = useState(reportSummary.description);
  const [convertInternalNotes, setConvertInternalNotes] = useState('');
  const [convertEstimatedDuration, setConvertEstimatedDuration] = useState('');
  const [convertDueDate, setConvertDueDate] = useState('');
  const [rejectReason, setRejectReason] = useState<ReportRejectionReason>(ReportRejectionReason.INVALID_REPORT);
  const [rejectDetail, setRejectDetail] = useState('');
  const [deferNote, setDeferNote] = useState('');
  const [archiveReason, setArchiveReason] = useState<ReportArchiveReason>(ReportArchiveReason.MANAGEMENT_DECISION);

  const { data: detail, isLoading: detailLoading, isError: detailError } = useQuery({
    queryKey: ['supervisor', 'reports', reportSummary.id],
    queryFn: () => reportsApi.getOne(reportSummary.id),
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports'] });
  }

  const commentMutation = useMutation({
    mutationFn: (content: string) => reportsApi.addComment(reportSummary.id, { content }),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.commentAdded'));
      setCommentContent('');
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.commentAddError')));
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (commentId: string) =>
      reportsApi.acknowledgeComment(reportSummary.id, commentId),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.commentAcknowledged'));
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.commentAcknowledgeError')));
    },
  });

  const convertMutation = useMutation({
    mutationFn: (body: Parameters<typeof reportsApi.convert>[1]) =>
      reportsApi.convert(reportSummary.id, body),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.convertSuccess'));
      setActiveAction(null);
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.convertError')));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (body: Parameters<typeof reportsApi.reject>[1]) =>
      reportsApi.reject(reportSummary.id, body),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.rejectSuccess'));
      setActiveAction(null);
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.rejectError')));
    },
  });

  const deferMutation = useMutation({
    mutationFn: (body: Parameters<typeof reportsApi.defer>[1]) =>
      reportsApi.defer(reportSummary.id, body),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.deferSuccess'));
      setActiveAction(null);
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.deferError')));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => reportsApi.reopen(reportSummary.id),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.reopenSuccess'));
      setActiveAction(null);
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.reopenError')));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (body: Parameters<typeof reportsApi.archive>[1]) =>
      reportsApi.archive(reportSummary.id, body),
    onSuccess: () => {
      toast.success(t('supervisorReports.toasts.archiveSuccess'));
      setActiveAction(null);
      invalidateAll();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.archiveError')));
    },
  });

  const isActionPending =
    commentMutation.isPending ||
    acknowledgeMutation.isPending ||
    convertMutation.isPending ||
    rejectMutation.isPending ||
    deferMutation.isPending ||
    reopenMutation.isPending ||
    archiveMutation.isPending;

  function handleCommentSubmit() {
    const content = commentContent.trim();
    if (!content) {
      toast.error(t('supervisorReports.validation.commentRequired'));
      return;
    }
    commentMutation.mutate(content);
  }

  function handleConvert() {
    const description = convertDescription.trim();
    if (!description) {
      toast.error(t('supervisorReports.validation.convertDescriptionRequired'));
      return;
    }
    const estimatedDurationMinutes = convertEstimatedDuration.trim()
      ? Number(convertEstimatedDuration.trim())
      : undefined;
    if (
      estimatedDurationMinutes !== undefined &&
      (!Number.isInteger(estimatedDurationMinutes) || estimatedDurationMinutes <= 0)
    ) {
      toast.error(t('supervisorReports.validation.estimatedDurationInvalid'));
      return;
    }
    convertMutation.mutate({
      priority: convertPriority,
      description,
      internalNotes: convertInternalNotes.trim() || undefined,
      estimatedDurationMinutes,
      dueDate: convertDueDate || undefined,
    });
  }

  const status = detail?.status ?? reportSummary.status;

  const metaLabelStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--sb-text-tertiary)',
    marginBottom: 3,
  };

  const metaValueStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--sb-text-primary)',
    fontWeight: 500,
  };

  function sectionLabel(text: string) {
    return (
      <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 8 }}>
        {text.toUpperCase()}
      </Mono>
    );
  }

  const actionToggleStyle = (
    isActive: boolean,
    color = 'var(--sb-s-active)',
    bg = 'var(--sb-s-active-bg)',
  ): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    background: isActive ? bg : 'var(--sb-surface)',
    border: `1px solid ${isActive ? color : 'var(--sb-border)'}`,
    borderRadius: 2,
    cursor: 'pointer',
    marginBottom: 4,
    textAlign: 'left',
  });

  const history: ReportAssetInterventionHistoryItem[] = detail?.assetInterventionHistory ?? [];
  const certs: ReportAssetCertAlert[] = detail?.asset?.certificates ?? [];
  const activeWOs: ReportAssetActiveWO[] = detail?.asset?.workOrders ?? [];

  const canConvert = status === ProblemReportStatus.PENDING;
  const canReject  = status === ProblemReportStatus.PENDING;
  const canDefer   = status === ProblemReportStatus.PENDING;
  const canArchive = status === ProblemReportStatus.PENDING || status === ProblemReportStatus.DEFERRED;
  const canReopen  = status === ProblemReportStatus.DEFERRED;
  const hasActions = canConvert || canReject || canDefer || canArchive || canReopen;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--sb-surface)' }}>

      {/* Panel header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--sb-border)', background: 'var(--sb-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sb-text-primary)',
              letterSpacing: '0.06em',
              marginBottom: 2,
            }}>
              {reportSummary.referenceNumber}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {reportSummary.asset.name}
            </div>
            {reportSummary.asset.location.fullPath && (
              <Mono size={8} color="var(--sb-text-tertiary)" style={{ marginTop: 2 }}>
                {reportSummary.asset.location.fullPath}
              </Mono>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--sb-border)',
              padding: '2px 7px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <ReportStatusPill status={status} />
          <UrgencyPill urgency={reportSummary.urgencyPerception} />
          {reportSummary.submittedDespiteWarning && (
            <DuplicateSubmissionBadge submittedDespiteWarning />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--sb-border)', background: 'var(--sb-surface)', flexShrink: 0 }}>
        {(['detail', 'actions'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0 16px',
              height: 36,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: activeTab === tab ? 'var(--sb-text-primary)' : 'var(--sb-text-tertiary)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--sb-text-primary)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab === 'detail'
              ? t('supervisorReports.tabs.detail')
              : t('supervisorReports.tabs.actions')}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* DETAIL TAB */}
        {activeTab === 'detail' && (
          detailLoading ? (
            <TableLoading label={t('common.loading')} />
          ) : detailError || !detail ? (
            <div style={{ padding: 16 }}>
              <div style={{ padding: '10px 12px', border: '1px solid var(--sb-p-crit)', background: 'var(--sb-p-crit-bg)', borderRadius: 2, fontSize: 12, color: 'var(--sb-p-crit)' }}>
                {t('supervisorReports.states.detailError')}
              </div>
            </div>
          ) : (
            <div style={{ padding: 16 }}>

              {/* Active WO duplicate banner */}
              {activeWOs.length > 0 && (
                <div style={{ padding: '10px 12px', border: '1px solid var(--sb-s-active)', background: 'var(--sb-s-active-bg)', borderRadius: 2, marginBottom: 12 }}>
                  <Mono size={9} color="var(--sb-s-active)" tracking="0.10em" style={{ marginBottom: 6 }}>
                    {t('supervisorReports.detail.duplicateWoBannerTitle')}
                  </Mono>
                  {activeWOs.map((wo: ReportAssetActiveWO) => (
                    <div key={wo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <WOStatusPill status={wo.status as WorkOrderStatus} />
                      <Mono size={9} color="var(--sb-text-primary)" tracking="0.06em">{wo.referenceNumber}</Mono>
                      {wo.description && (
                        <span style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {wo.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Metadata grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sb-border)', marginBottom: 12 }}>
                {[
                  { label: t('supervisorReports.detail.asset'),        value: detail.asset.name },
                  { label: t('supervisorReports.detail.reporter'),     value: detail.reporter.name },
                  { label: t('common.date'),                           value: formatDateTime(detail.createdAt) },
                  { label: t('supervisorReports.detail.processedAt'),  value: formatDateTime(detail.processedAt) },
                  { label: t('supervisorReports.detail.processedBy'),  value: detail.processedBy?.name ?? '—' },
                  { label: t('supervisorReports.detail.linkedWorkOrder'), value: detail.replacedByWorkOrderRef ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '8px 10px', background: 'var(--sb-bg)' }}>
                    <div style={metaLabelStyle}>{label}</div>
                    <div style={metaValueStyle}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Description */}
              <div style={{ marginBottom: 12 }}>
                {sectionLabel(t('common.description'))}
                <div style={{ fontSize: 12, color: 'var(--sb-text-primary)', lineHeight: 1.7, padding: '8px 10px', background: 'var(--sb-bg)', border: '1px solid var(--sb-border)' }}>
                  {detail.description}
                </div>
              </div>

              {/* Rejection note */}
              {(detail.rejectionReason || detail.rejectionDetail) && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--sb-p-crit-bg)', border: '1px solid var(--sb-p-crit)', borderRadius: 2 }}>
                  <div style={metaLabelStyle}>{t('supervisorReports.detail.rejectedReason')}</div>
                  <div style={metaValueStyle}>
                    {detail.rejectionReason ? t(`supervisorReports.rejectionReasons.${detail.rejectionReason}`) : '—'}
                  </div>
                  {detail.rejectionDetail && (
                    <div style={{ fontSize: 11, color: 'var(--sb-text-secondary)', marginTop: 4 }}>{detail.rejectionDetail}</div>
                  )}
                </div>
              )}

              {/* Defer note */}
              {(detail.deferNote || detail.deferredAt) && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--sb-s-wait-bg)', border: '1px solid var(--sb-s-wait)', borderRadius: 2 }}>
                  <div style={metaLabelStyle}>{t('supervisorReports.detail.deferNote')}</div>
                  <div style={metaValueStyle}>{detail.deferNote ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', marginTop: 4 }}>{formatDateTime(detail.deferredAt)}</div>
                </div>
              )}

              {/* Archive reason */}
              {(detail.archiveReason || detail.status === ProblemReportStatus.ARCHIVED) && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--sb-s-cancel-bg)', border: '1px solid var(--sb-s-cancel)', borderRadius: 2 }}>
                  <div style={metaLabelStyle}>{t('supervisorReports.detail.archiveReason')}</div>
                  <div style={metaValueStyle}>
                    {detail.archiveReason ? t(`supervisorReports.archiveReasons.${detail.archiveReason}`) : '—'}
                  </div>
                </div>
              )}

              {/* Derived work orders */}
              {detail.derivedWorkOrders.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {sectionLabel(t('supervisorReports.detail.linkedWorkOrders'))}
                  {detail.derivedWorkOrders.map((wo) => (
                    <div
                      key={wo.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', border: '1px solid var(--sb-border)', marginBottom: 4, background: 'var(--sb-surface)' }}
                    >
                      <Mono size={10} color="var(--sb-text-primary)" tracking="0.06em" weight={600}>{wo.referenceNumber}</Mono>
                      <WOStatusPill status={wo.status} />
                    </div>
                  ))}
                </div>
              )}

              {/* Cert alerts */}
              {certs.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {sectionLabel(t('supervisorReports.detail.assetCertAlerts'))}
                  {certs.map((cert: ReportAssetCertAlert) => (
                    <div
                      key={cert.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', border: '1px solid var(--sb-border)', marginBottom: 4, background: 'var(--sb-surface)' }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)' }}>
                          {cert.otherType ?? cert.certificateType}
                        </div>
                        <Mono size={9} color="var(--sb-text-tertiary)">{cert.issuingAuthority}</Mono>
                      </div>
                      <span
                        style={{
                          background: cert.status === 'EXPIRED' ? 'var(--sb-p-crit-bg)' : 'var(--sb-s-active-bg)',
                          color: cert.status === 'EXPIRED' ? 'var(--sb-p-crit)' : 'var(--sb-s-active)',
                          border: `1px solid ${cert.status === 'EXPIRED' ? 'var(--sb-p-crit)' : 'var(--sb-s-active)'}`,
                          borderRadius: 2,
                          padding: '2px 6px',
                          fontFamily: MONO,
                          fontSize: 8,
                          letterSpacing: '0.10em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cert.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Intervention history */}
              {history.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {sectionLabel(t('supervisorReports.detail.assetInterventionHistory'))}
                  {history.map((item: ReportAssetInterventionHistoryItem) => (
                    <div key={item.id} style={{ padding: '6px 10px', border: '1px solid var(--sb-border)', marginBottom: 4, background: 'var(--sb-surface)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Mono size={10} color="var(--sb-text-primary)" tracking="0.06em" weight={600}>{item.referenceNumber}</Mono>
                        <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.08em">{item.type}</Mono>
                      </div>
                      {item.description && (
                        <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {item.description}
                        </div>
                      )}
                      <Mono size={9} color="var(--sb-text-tertiary)" style={{ marginTop: 2 }}>
                        {item.principalTechnician?.name ? `${item.principalTechnician.name} · ` : ''}{formatDateTime(item.closedAt)}
                      </Mono>
                    </div>
                  ))}
                </div>
              )}

              {/* Comments */}
              <div>
                {sectionLabel(t('supervisorReports.detail.comments'))}
                {detail.comments.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', marginBottom: 12 }}>
                    {t('supervisorReports.states.commentsEmpty')}
                  </div>
                ) : (
                  detail.comments.map((comment) => (
                    <div key={comment.id} style={{ border: '1px solid var(--sb-border)', padding: '8px 10px', marginBottom: 6, background: 'var(--sb-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>{comment.author.name}</div>
                          <Mono size={8} color="var(--sb-text-tertiary)">{formatDateTime(comment.createdAt)}</Mono>
                        </div>
                        {comment.acknowledgedBySupervisor ? (
                          <span
                            style={{
                              background: 'var(--sb-s-done-bg)',
                              color: 'var(--sb-s-done)',
                              border: '1px solid var(--sb-s-done)',
                              borderRadius: 2,
                              padding: '2px 6px',
                              fontFamily: MONO,
                              fontSize: 8,
                              letterSpacing: '0.10em',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {t('supervisorReports.detail.commentAcknowledged')}
                          </span>
                        ) : (
                          <button
                            onClick={() => acknowledgeMutation.mutate(comment.id)}
                            disabled={isActionPending}
                            style={btnSecondaryStyle(isActionPending)}
                          >
                            {t('supervisorReports.actions.acknowledge')}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sb-text-primary)', lineHeight: 1.6 }}>{comment.content}</div>
                    </div>
                  ))
                )}

                <div style={{ marginTop: 8 }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                    {t('supervisorReports.detail.addCommentTitle').toUpperCase()}
                  </Mono>
                  <textarea
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder={t('supervisorReports.detail.commentPlaceholder')}
                    style={textareaS}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <button
                      onClick={handleCommentSubmit}
                      disabled={commentMutation.isPending}
                      style={btnPrimaryStyle(commentMutation.isPending)}
                    >
                      {commentMutation.isPending && (
                        <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0 }} />
                      )}
                      {t('supervisorReports.actions.addComment')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ACTIONS TAB */}
        {activeTab === 'actions' && (
          <div style={{ padding: 16 }}>
            {!hasActions ? (
              <div style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', textAlign: 'center', padding: '24px 0' }}>
                {t('supervisorReports.states.noActions')}
              </div>
            ) : (
              <>
                {/* Convert */}
                {canConvert && (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setActiveAction(activeAction === 'convert' ? null : 'convert')}
                      style={actionToggleStyle(activeAction === 'convert', 'var(--sb-s-done)', 'var(--sb-s-done-bg)')}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>
                          {t('supervisorReports.detail.convertTitle')}
                        </div>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorReports.detail.convertDescription')}</Mono>
                      </div>
                      <Mono size={9} color="var(--sb-text-tertiary)">{activeAction === 'convert' ? '▲' : '▼'}</Mono>
                    </button>
                    {activeAction === 'convert' && (
                      <div style={actionBlockStyle}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <div>
                            <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                              {t('supervisorReports.detail.priority').toUpperCase()}
                            </Mono>
                            <select value={convertPriority} onChange={(e) => setConvertPriority(e.target.value as WorkOrderPriority)} style={selectS}>
                              {PRIORITY_OPTIONS.map((p) => (
                                <option key={p} value={p}>{t(`supervisorReports.priorities.${p}`)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                              {t('supervisorReports.detail.estimatedDurationMinutes').toUpperCase()}
                            </Mono>
                            <input type="number" min={1} value={convertEstimatedDuration} onChange={(e) => setConvertEstimatedDuration(e.target.value)} style={inputS} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                            {t('supervisorReports.detail.description').toUpperCase()}
                          </Mono>
                          <input value={convertDescription} onChange={(e) => setConvertDescription(e.target.value)} style={inputS} />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                            {t('supervisorReports.detail.internalNotes').toUpperCase()}
                          </Mono>
                          <textarea value={convertInternalNotes} onChange={(e) => setConvertInternalNotes(e.target.value)} style={{ ...textareaS, minHeight: 56 }} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                            {t('supervisorReports.detail.dueDate').toUpperCase()}
                          </Mono>
                          <input type="date" value={convertDueDate} onChange={(e) => setConvertDueDate(e.target.value)} style={inputS} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={handleConvert} disabled={convertMutation.isPending} style={btnPrimaryStyle(convertMutation.isPending)}>
                            {convertMutation.isPending && <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0 }} />}
                            {t('supervisorReports.actions.convert')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reject */}
                {canReject && (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setActiveAction(activeAction === 'reject' ? null : 'reject')}
                      style={actionToggleStyle(activeAction === 'reject', 'var(--sb-p-crit)', 'var(--sb-p-crit-bg)')}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>
                          {t('supervisorReports.detail.rejectTitle')}
                        </div>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorReports.detail.rejectDescription')}</Mono>
                      </div>
                      <Mono size={9} color="var(--sb-text-tertiary)">{activeAction === 'reject' ? '▲' : '▼'}</Mono>
                    </button>
                    {activeAction === 'reject' && (
                      <div style={actionBlockStyle}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <div>
                            <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                              {t('supervisorReports.detail.reason').toUpperCase()}
                            </Mono>
                            <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value as ReportRejectionReason)} style={selectS}>
                              {REJECTION_REASON_OPTIONS.map((r) => (
                                <option key={r} value={r}>{t(`supervisorReports.rejectionReasons.${r}`)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                              {t('supervisorReports.detail.detail').toUpperCase()}
                            </Mono>
                            <input value={rejectDetail} onChange={(e) => setRejectDetail(e.target.value)} style={inputS} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => rejectMutation.mutate({ reason: rejectReason, detail: rejectDetail.trim() || undefined })}
                            disabled={rejectMutation.isPending}
                            style={btnDestructiveStyle(rejectMutation.isPending)}
                          >
                            {rejectMutation.isPending && <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0 }} />}
                            {t('supervisorReports.actions.reject')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Defer */}
                {canDefer && (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setActiveAction(activeAction === 'defer' ? null : 'defer')}
                      style={actionToggleStyle(activeAction === 'defer', 'var(--sb-s-wait)', 'var(--sb-s-wait-bg)')}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>
                          {t('supervisorReports.detail.deferTitle')}
                        </div>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorReports.detail.deferDescription')}</Mono>
                      </div>
                      <Mono size={9} color="var(--sb-text-tertiary)">{activeAction === 'defer' ? '▲' : '▼'}</Mono>
                    </button>
                    {activeAction === 'defer' && (
                      <div style={actionBlockStyle}>
                        <div style={{ marginBottom: 12 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                            {t('supervisorReports.detail.note').toUpperCase()}
                          </Mono>
                          <textarea value={deferNote} onChange={(e) => setDeferNote(e.target.value)} style={{ ...textareaS, minHeight: 56 }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => deferMutation.mutate({ note: deferNote.trim() || undefined })}
                            disabled={deferMutation.isPending}
                            style={btnSecondaryStyle(deferMutation.isPending)}
                          >
                            {deferMutation.isPending && <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0 }} />}
                            {t('supervisorReports.actions.defer')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Archive */}
                {canArchive && (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setActiveAction(activeAction === 'archive' ? null : 'archive')}
                      style={actionToggleStyle(activeAction === 'archive', 'var(--sb-s-cancel)', 'var(--sb-s-cancel-bg)')}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>
                          {t('supervisorReports.detail.archiveTitle')}
                        </div>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorReports.detail.archiveDescription')}</Mono>
                      </div>
                      <Mono size={9} color="var(--sb-text-tertiary)">{activeAction === 'archive' ? '▲' : '▼'}</Mono>
                    </button>
                    {activeAction === 'archive' && (
                      <div style={actionBlockStyle}>
                        <div style={{ marginBottom: 12 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" tracking="0.12em" style={{ marginBottom: 4 }}>
                            {t('supervisorReports.detail.archiveReasonLabel').toUpperCase()}
                          </Mono>
                          <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value as ReportArchiveReason)} style={selectS}>
                            {ARCHIVE_REASON_OPTIONS.map((r) => (
                              <option key={r} value={r}>{t(`supervisorReports.archiveReasons.${r}`)}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => archiveMutation.mutate({ archiveReason })}
                            disabled={archiveMutation.isPending}
                            style={btnSecondaryStyle(archiveMutation.isPending)}
                          >
                            {archiveMutation.isPending && <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0 }} />}
                            {t('supervisorReports.actions.archive')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reopen */}
                {canReopen && (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setActiveAction(activeAction === 'reopen' ? null : 'reopen')}
                      style={actionToggleStyle(activeAction === 'reopen', 'var(--sb-s-open)', 'var(--sb-s-open-bg)')}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>
                          {t('supervisorReports.detail.reopenTitle')}
                        </div>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorReports.detail.reopenDescription')}</Mono>
                      </div>
                      <Mono size={9} color="var(--sb-text-tertiary)">{activeAction === 'reopen' ? '▲' : '▼'}</Mono>
                    </button>
                    {activeAction === 'reopen' && (
                      <div style={actionBlockStyle}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => reopenMutation.mutate()}
                            disabled={reopenMutation.isPending}
                            style={btnSecondaryStyle(reopenMutation.isPending)}
                          >
                            {reopenMutation.isPending && <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0 }} />}
                            {t('supervisorReports.actions.reopen')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Reports Board ──────────────────────────────────────────────────────────────

export function ReportsBoard() {
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProblemReportStatus | ''>('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyPerception | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReportListItem | null>(null);

  const queryParams = {
    page,
    limit: LIMIT,
    ...(search ? { search } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(urgencyFilter ? { urgencyPerception: urgencyFilter } : {}),
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'reports', page, search, statusFilter, urgencyFilter],
    queryFn: () => reportsApi.list(queryParams),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const panelOpen = !!selected;

  const COL = '130px 1fr 150px 60px';

  const hasActiveFilters = !!(search || searchInput || statusFilter || urgencyFilter);

  function handleApplyFilters() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleResetFilters() {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setUrgencyFilter('');
    setPage(1);
  }

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div
        style={{
          padding: '0 12px',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          flexShrink: 0,
          flexWrap: 'wrap',
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
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyFilters(); } }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            placeholder={t('supervisorReports.filters.searchPlaceholder')}
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
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as ProblemReportStatus | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorReports.filters.allStatuses')}</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>{t(`supervisorReports.status.${o}`)}</option>
          ))}
        </select>
        <select
          value={urgencyFilter}
          onChange={(e) => { setUrgencyFilter(e.target.value as UrgencyPerception | ''); setPage(1); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('supervisorReports.filters.allUrgencies')}</option>
          {URGENCY_OPTIONS.map((o) => (
            <option key={o} value={o}>{t(`supervisorReports.urgency.${o}`)}</option>
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
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--sb-text-tertiary)',
              padding: '0 2px',
              flexShrink: 0,
            }}
          >
            {t('supervisorReports.filters.reset')}
          </button>
        )}

        <div style={{ flex: 1 }} />
      </div>

      {/* Column headers */}
      {!isLoading && !isError && !!data?.data.length && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: COL,
            paddingLeft: 19,
            paddingRight: 16,
            height: 28,
            alignItems: 'center',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          <Mono size={8} tracking="0.13em">{t('supervisorReports.columns.reference')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorReports.columns.asset')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorReports.columns.status')}</Mono>
          <Mono size={8} tracking="0.13em">{t('supervisorReports.columns.age')}</Mono>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('supervisorReports.states.error')} />
        ) : !data?.data.length ? (
          <TableEmpty label={t('supervisorReports.states.empty')} />
        ) : (
          data.data.map((report) => {
            const isSelected = selected?.id === report.id;
            const aging = report.status === ProblemReportStatus.DEFERRED
              ? getDeferredAgingInfo(report.deferredAt)
              : null;
            return (
              <div
                key={report.id}
                onClick={() => setSelected(isSelected ? null : report)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: COL,
                  paddingRight: 16,
                  height: 48,
                  alignItems: 'center',
                  borderBottom: '1px solid var(--sb-border)',
                  borderLeft: `3px solid ${URGENCY_BORDER[report.urgencyPerception]}`,
                  background: isSelected ? 'var(--sb-s-active-bg)' : 'transparent',
                  outline: isSelected ? '1px solid var(--sb-border-strong)' : 'none',
                  outlineOffset: -1,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--sb-hover)'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <div style={{ paddingLeft: 13, paddingRight: 12, minWidth: 0 }}>
                  <Mono size={10} color="var(--sb-text-primary)" weight={600} tracking="0.06em">
                    {report.referenceNumber}
                  </Mono>
                  <Mono size={8} color={URGENCY_COLOR[report.urgencyPerception]} tracking="0.08em">
                    {report.urgencyPerception}
                  </Mono>
                </div>
                <div style={{ padding: '0 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {report.asset.name}
                  </div>
                  <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {report.asset.location.fullPath}
                  </Mono>
                </div>
                <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                  <ReportStatusPill status={report.status} />
                  {aging && (
                    <Mono size={8} color={aging.color} tracking="0.08em">
                      {t(`supervisorReports.aging.${aging.label}`)}
                    </Mono>
                  )}
                </div>
                <div style={{ padding: '0 12px' }}>
                  <Mono size={10} color="var(--sb-text-secondary)">
                    {formatAge(report.createdAt)}
                  </Mono>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
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
            {t('supervisorReports.total', { count: data.total })}
          </Mono>
        )}
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
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
            <ReportDetailPanel
              key={selected.id}
              reportSummary={selected}
              onClose={() => setSelected(null)}
            />
          ) : null
        }
        panelOpen={panelOpen}
      />
    </div>
  );
}
