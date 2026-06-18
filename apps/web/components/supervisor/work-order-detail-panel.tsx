'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Download, Loader2 } from 'lucide-react';
import {
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderType,
  WOCancellationReason,
  WOReassignmentReason,
  ValidationRejectionReason,
  AssetStatus,
  OnHoldReasonType,
  Role,
} from '@gmao/shared';
import {
  workOrdersApi,
  type WorkOrderListItem,
  type AssignWorkOrderPayload,
  type ReassignTechnicianPayload,
  type PromoteTechnicianPayload,
  type CancelWorkOrderPayload,
  type RejectValidationPayload,
  type ValidateWorkOrderPayload,
  type UpdateHoldMetadataPayload,
  type CreateFollowUpPayload,
} from '@/lib/work-orders.api';
import {
  buildHoldMetadataPayload,
  requiresHoldSupervisorAssetStatusChoice,
} from '@/lib/hold-metadata';
import { InterventionResult } from '@gmao/shared';
import { usersApi } from '@/lib/users.api';
import {
  getContributorWithoutLogNames,
  getTimeDeviationPresentation,
} from '@/lib/work-order-validation-insights';
import { StatusPill } from '@/components/ui/status-pill';
import { PriorityChip } from '@/components/ui/priority-chip';
import { Mono } from '@/components/ui/mono';

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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function isTerminalStatus(status: WorkOrderStatus): boolean {
  return status === WorkOrderStatus.CLOSED || status === WorkOrderStatus.CANCELLED;
}

const CANCELLATION_REASONS = Object.values(WOCancellationReason);
const REJECTION_REASONS = Object.values(ValidationRejectionReason);
const PRIORITY_OPTIONS = Object.values(WorkOrderPriority);

type ActionPanel =
  | 'publish'
  | 'assign'
  | 'reassign'
  | 'promote'
  | 'validate'
  | 'reject'
  | 'cancel'
  | 'authorizeSim'
  | 'changePriority'
  | null;

type PanelTab = 'detail' | 'actions';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

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
  display: 'block',
  width: '100%',
  height: 28,
  padding: '0 4px 0 8px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 12,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
};

const actionPanelStyle: React.CSSProperties = {
  border: '1px solid var(--sb-border)',
  padding: '12px 14px',
  background: 'var(--sb-surface)',
  marginBottom: 8,
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

interface WorkOrderDetailPanelProps {
  workOrder: WorkOrderListItem | { id: string };
  onClose: () => void;
}

export function WorkOrderDetailPanel({ workOrder, onClose }: WorkOrderDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PanelTab>('detail');
  const [activePanel, setActivePanel] = useState<ActionPanel>(null);

  const [principalId, setPrincipalId] = useState('');
  const [contributorIds, setContributorIds] = useState<string[]>([]);

  const [newPriority, setNewPriority] = useState<WorkOrderPriority>(WorkOrderPriority.MEDIUM);

  const [validateAssetStatusOverride, setValidateAssetStatusOverride] =
    useState<AssetStatus | ''>('');

  const [followUpPrompt, setFollowUpPrompt] = useState<{
    originalWoId: string;
    assetId: string;
    description: string;
    referenceNumber: string;
    priority: WorkOrderPriority;
  } | null>(null);

  const pendingFollowUpCtxRef = useRef<typeof followUpPrompt>(null);

  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const [promoteNewPrincipalId, setPromoteNewPrincipalId] = useState('');
  const [promoteReason, setPromoteReason] = useState<WOReassignmentReason>(WOReassignmentReason.TECHNICIAN_ABSENT);
  const [promoteReasonDetail, setPromoteReasonDetail] = useState('');

  const { register: registerCancel, handleSubmit: handleCancelSubmit, reset: resetCancel } =
    useForm<{ reason: WOCancellationReason; detail: string; postAssetStatus: string }>({
      defaultValues: {
        reason: WOCancellationReason.CREATED_IN_ERROR,
        detail: '',
        postAssetStatus: AssetStatus.OPERATIONAL,
      },
    });

  const {
    register: registerReject,
    handleSubmit: handleRejectSubmit,
    reset: resetReject,
  } = useForm<{ rejectionReason: ValidationRejectionReason; rejectionDetail: string }>({
    defaultValues: {
      rejectionReason: ValidationRejectionReason.INSUFFICIENT_DESCRIPTION,
      rejectionDetail: '',
    },
  });

  const {
    register: registerReassign,
    handleSubmit: handleReassignSubmit,
    reset: resetReassign,
  } = useForm<{ newTechnicianId: string; reason: WOReassignmentReason; reasonDetail: string }>({
    defaultValues: {
      newTechnicianId: '',
      reason: WOReassignmentReason.TECHNICIAN_OVERLOADED,
      reasonDetail: '',
    },
  });

  const [showHoldMetadataForm, setShowHoldMetadataForm] = useState(false);
  const {
    register: registerHoldMeta,
    handleSubmit: handleHoldMetaSubmit,
    reset: resetHoldMeta,
  } = useForm<{
    expectedResolutionDate: string;
    retryDate: string;
    resolutionNote: string;
    supervisorAssetStatusChoice: AssetStatus | '';
  }>({
    defaultValues: {
      expectedResolutionDate: '',
      retryDate: '',
      resolutionNote: '',
      supervisorAssetStatusChoice: '',
    },
  });

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'work-orders', workOrder.id, 'detail'],
    queryFn: () => workOrdersApi.getById(workOrder.id),
    enabled: !!workOrder.id,
  });

  const { data: techniciansData } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: () => usersApi.list({ role: Role.TECHNICIAN, isActive: true }),
    enabled: activePanel === 'assign' || activePanel === 'reassign' || activePanel === 'promote',
  });

  const technicians = techniciansData ?? [];

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'work-orders'] });
    void queryClient.invalidateQueries({
      queryKey: ['supervisor', 'work-orders', workOrder.id, 'detail'],
    });
  }

  function resetPanels() {
    setActivePanel(null);
    setPrincipalId('');
    setContributorIds([]);
    setPromoteNewPrincipalId('');
    setPromoteReason(WOReassignmentReason.TECHNICIAN_ABSENT);
    setPromoteReasonDetail('');
    setValidateAssetStatusOverride('');
    setFollowUpPrompt(null);
    resetCancel();
    resetReject();
    resetReassign();
  }

  const toggleContributor = (id: string) => {
    setContributorIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const publishMutation = useMutation({
    mutationFn: () => workOrdersApi.publish(workOrder.id),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.publishSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.publishError'))),
  });

  const assignMutation = useMutation({
    mutationFn: (payload: AssignWorkOrderPayload) =>
      workOrdersApi.assign(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.assignSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.assignError'))),
  });

  const validateMutation = useMutation({
    mutationFn: (payload?: ValidateWorkOrderPayload) =>
      workOrdersApi.validate(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.validateSuccess'));
      setActivePanel(null);
      setValidateAssetStatusOverride('');
      if (pendingFollowUpCtxRef.current) {
        setFollowUpPrompt(pendingFollowUpCtxRef.current);
        pendingFollowUpCtxRef.current = null;
      }
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.validateError'))),
  });

  const createFollowUpMutation = useMutation({
    mutationFn: (payload: CreateFollowUpPayload) =>
      workOrdersApi.createFollowUp(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.followUpSuccess'));
      setFollowUpPrompt(null);
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.followUpError'))),
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: RejectValidationPayload) =>
      workOrdersApi.reject(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.rejectSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.rejectError'))),
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: CancelWorkOrderPayload) =>
      workOrdersApi.cancel(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.cancelSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.cancelError'))),
  });

  const reassignMutation = useMutation({
    mutationFn: (payload: ReassignTechnicianPayload) =>
      workOrdersApi.reassign(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.reassignSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.reassignError'))),
  });

  const promoteMutation = useMutation({
    mutationFn: (payload: PromoteTechnicianPayload) =>
      workOrdersApi.promote(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.promoteSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.promoteError'))),
  });

  const resolveBlockMutation = useMutation({
    mutationFn: (blockFlagId: string) =>
      workOrdersApi.resolveBlock(workOrder.id, blockFlagId),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.resolveBlockSuccess'));
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.resolveBlockError'))),
  });

  const authorizeSimMutation = useMutation({
    mutationFn: () => workOrdersApi.authorizeSimultaneous(workOrder.id),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.authorizeSimSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.authorizeSimError'))),
  });

  const updateHoldMetaMutation = useMutation({
    mutationFn: (payload: UpdateHoldMetadataPayload) =>
      workOrdersApi.updateHoldMetadata(workOrder.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.holdMetaUpdateSuccess'));
      setShowHoldMetadataForm(false);
      resetHoldMeta();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.holdMetaUpdateError'))),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: WorkOrderPriority) =>
      workOrdersApi.changePriority(workOrder.id, { priority }),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.priorityUpdateSuccess'));
      setActivePanel(null);
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.priorityUpdateError'))),
  });

  const isMutating =
    publishMutation.isPending ||
    assignMutation.isPending ||
    validateMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    reassignMutation.isPending ||
    promoteMutation.isPending ||
    resolveBlockMutation.isPending ||
    authorizeSimMutation.isPending ||
    updateHoldMetaMutation.isPending;

  const handleAssignSubmit = () => {
    if (!principalId) return;
    assignMutation.mutate({
      principalTechnicianId: principalId,
      contributorIds: contributorIds.length > 0 ? contributorIds : undefined,
    });
  };

  const handleCancelFormSubmit = (values: {
    reason: WOCancellationReason;
    detail: string;
    postAssetStatus: string;
  }) => {
    cancelMutation.mutate({
      reason: values.reason,
      detail: values.detail || undefined,
      postCancellationAssetStatus: values.postAssetStatus as AssetStatus,
    });
  };

  const handleRejectFormSubmit = (values: {
    rejectionReason: ValidationRejectionReason;
    rejectionDetail: string;
  }) => {
    rejectMutation.mutate({
      rejectionReason: values.rejectionReason,
      rejectionDetail: values.rejectionDetail || undefined,
    });
  };

  const handleReassignFormSubmit = (values: {
    newTechnicianId: string;
    reason: WOReassignmentReason;
    reasonDetail: string;
  }) => {
    if (!values.newTechnicianId) return;
    reassignMutation.mutate({
      newTechnicianId: values.newTechnicianId,
      reason: values.reason,
      reasonDetail: values.reasonDetail || undefined,
    });
  };

  const handleHoldMetaFormSubmit = (values: {
    expectedResolutionDate: string;
    retryDate: string;
    resolutionNote: string;
    supervisorAssetStatusChoice: AssetStatus | '';
  }) => {
    const payload: UpdateHoldMetadataPayload = buildHoldMetadataPayload(values);
    updateHoldMetaMutation.mutate(payload);
  };

  const status =
    detail?.status ??
    ('status' in workOrder ? (workOrder as WorkOrderListItem).status : undefined);

  const activeHoldPeriod = detail?.onHoldPeriods.find((hold) => hold.resumedAt === null) ?? null;
  const requiresSupervisorAssetStatusChoice = requiresHoldSupervisorAssetStatusChoice(
    activeHoldPeriod?.reasonType as OnHoldReasonType | null | undefined,
  );

  const lastCompletedIntervention = detail?.interventionLogs
    ?.filter((l) => l.endedAt !== null && l.result !== null)
    .sort((a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime())[0] ?? null;

  const isCouldNotIntervene =
    lastCompletedIntervention?.result === InterventionResult.COULD_NOT_INTERVENE;

  const contributorsWithoutLog = detail?.contributorsWithoutLog ?? [];
  const hasContributorsWithoutLog = contributorsWithoutLog.length > 0;
  const hasNotableTimeDeviation = detail?.hasNotableTimeDeviation ?? false;
  const timeDeviation = detail?.timeDeviation;
  const timeDeviationPresentation = getTimeDeviationPresentation(timeDeviation);

  const priority =
    detail?.priority ??
    ('priority' in workOrder ? (workOrder as WorkOrderListItem).priority : undefined);

  const referenceNumber =
    detail?.referenceNumber ??
    ('referenceNumber' in workOrder ? (workOrder as WorkOrderListItem).referenceNumber : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      { }
      <div
        style={{
          background: 'var(--sb-surface)',
          padding: '12px 16px 10px',
          borderBottom: '1px solid var(--sb-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sb-text-primary)',
              letterSpacing: '0.06em',
              marginBottom: 2,
            }}>
              {referenceNumber ?? '—'}
            </div>
            {detail?.asset?.name && (
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {detail.asset.name}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { resetPanels(); onClose(); }}
            style={{
              background: 'transparent',
              border: '1px solid var(--sb-border)',
              padding: '2px 7px',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
          </button>
        </div>
        {(priority || status) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {priority && <PriorityChip priority={priority as WorkOrderPriority} />}
            {status && <StatusPill status={status as WorkOrderStatus} />}
          </div>
        )}
      </div>

      { }
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          flexShrink: 0,
        }}
      >
        {(['detail', 'actions'] as PanelTab[]).map((tab) => {
          const labels: Record<PanelTab, string> = { detail: 'DÉTAIL', actions: 'ACTIONS' };
          const isActive = activeTab === tab;
          const isActionsDisabled = tab === 'actions' && status && isTerminalStatus(status as WorkOrderStatus);
          return (
            <button
              key={tab}
              type="button"
              onClick={() => { if (!isActionsDisabled) setActiveTab(tab); }}
              disabled={!!isActionsDisabled}
              style={{
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--sb-text-primary)' : '2px solid transparent',
                cursor: isActionsDisabled ? 'not-allowed' : 'pointer',
                opacity: isActionsDisabled ? 0.4 : 1,
                marginBottom: -1,
              }}
            >
              <Mono
                size={9}
                color={isActive ? 'var(--sb-text-primary)' : 'var(--sb-text-secondary)'}
                tracking="0.12em"
                weight={isActive ? 600 : 500}
              >
                {labels[tab]}
              </Mono>
            </button>
          );
        })}
      </div>

      { }
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: 'var(--sb-text-tertiary)' }} />
          </div>
        ) : isError ? (
          <p style={{ fontSize: 13, color: 'var(--sb-p-crit)', textAlign: 'center', padding: '32px 0', margin: 0 }}>
            {t('supervisorWorkOrders.states.detailError')}
          </p>
        ) : detail ? (
          <>
            { }
            {activeTab === 'detail' && (
              <div>

                { }
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sb-border)', marginBottom: 16 }}>
                  <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.asset')}</Mono>
                    <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.asset.name}</span>
                  </div>
                  <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.location')}</Mono>
                    <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.asset.location.fullPath}</span>
                  </div>
                  <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.type')}</Mono>
                    <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{t(`supervisorWorkOrders.types.${detail.type}`)}</span>
                  </div>
                  <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.source')}</Mono>
                    <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{t(`supervisorWorkOrders.labels.sourceType.${detail.sourceType}`)}</span>
                  </div>
                  <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.dueDate')}</Mono>
                    <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{formatDate(detail.dueDate)}</span>
                  </div>
                  {detail.estimatedDurationMinutes != null && (
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.estimatedDuration')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>
                        {t('supervisorWorkOrders.detail.estimatedDurationValue', { count: detail.estimatedDurationMinutes })}
                      </span>
                    </div>
                  )}
                  {detail.closedAt && (
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.closedAt')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{formatDateTime(detail.closedAt)}</span>
                    </div>
                  )}
                  {detail.cancelledAt && (
                    <>
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.cancelledAt')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{formatDateTime(detail.cancelledAt)}</span>
                      </div>
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.cancellationReason')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>
                          {detail.cancellationReason ? t(`supervisorWorkOrders.cancellationReason.${detail.cancellationReason}`) : '—'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 6 }}>{t('supervisorWorkOrders.detail.description')}</Mono>
                  <p style={{ fontSize: 13, color: 'var(--sb-text-primary)', lineHeight: 1.7, margin: 0, borderLeft: '2px solid var(--sb-border)', paddingLeft: 10, whiteSpace: 'pre-wrap' }}>
                    {detail.description}
                  </p>
                </div>

                {detail.internalNotes && (
                  <div style={{ marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 6 }}>{t('supervisorWorkOrders.detail.internalNotes')}</Mono>
                    <p style={{ fontSize: 12, color: 'var(--sb-text-secondary)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{detail.internalNotes}</p>
                  </div>
                )}

                {detail.sourceReport && (
                  <div style={{ border: '1px solid var(--sb-border)', padding: '10px 12px', background: 'var(--sb-hover)', marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>{t('supervisorWorkOrders.detail.sourceReport')}</Mono>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorWorkOrders.detail.sourceReportRef')}:</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{detail.sourceReport.referenceNumber}</span>
                    </div>
                  </div>
                )}

                {status === WorkOrderStatus.PENDING_VALIDATION &&
                  (hasContributorsWithoutLog || hasNotableTimeDeviation) && (
                  <div style={{ border: '1px solid rgba(160,96,32,0.35)', background: 'var(--sb-p-high-bg)', padding: '10px 12px', marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-p-high)" block style={{ marginBottom: 8 }}>{t('supervisorWorkOrders.detail.validationSignalsTitle')}</Mono>
                    {hasContributorsWithoutLog && (
                      <div style={{ marginBottom: 6 }}>
                        <p style={{ fontSize: 12, color: '#5A3010', fontWeight: 500, margin: '0 0 2px' }}>{t('supervisorWorkOrders.detail.contributorsWithoutLogTitle')}</p>
                        <p style={{ fontSize: 11, color: '#5A3010', opacity: 0.8, margin: 0, lineHeight: 1.5 }}>
                          {t('supervisorWorkOrders.detail.contributorsWithoutLogDescription', {
                            names: getContributorWithoutLogNames(contributorsWithoutLog),
                          })}
                        </p>
                      </div>
                    )}
                    {hasNotableTimeDeviation && timeDeviation && (
                      <div>
                        <p style={{ fontSize: 12, color: '#5A3010', fontWeight: 500, margin: '0 0 2px' }}>{t('supervisorWorkOrders.detail.timeDeviationTitle')}</p>
                        <p style={{ fontSize: 11, color: '#5A3010', opacity: 0.8, margin: 0, lineHeight: 1.5 }}>
                          {t('supervisorWorkOrders.detail.timeDeviationDescription', {
                            estimated: timeDeviation.estimatedDurationMinutes ?? 0,
                            actual: timeDeviation.actualDurationMinutes,
                            deltaMinutes: timeDeviationPresentation.absoluteDeviationMinutes ?? 0,
                            deltaPercent: timeDeviationPresentation.absoluteDeviationPercent ?? 0,
                            direction: t(`supervisorWorkOrders.detail.timeDeviationDirection.${timeDeviationPresentation.direction}`),
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {(detail.followUpFrom || (detail.followUps && detail.followUps.length > 0)) && (
                  <div style={{ border: '1px solid var(--sb-border)', padding: '10px 12px', marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 6 }}>{t('supervisorWorkOrders.detail.followUpChain')}</Mono>
                    {detail.followUpFrom && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 3 }}>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorWorkOrders.detail.followUpFrom')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{detail.followUpFrom.referenceNumber}</span>
                      </div>
                    )}
                    {detail.followUps && detail.followUps.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorWorkOrders.detail.followUps')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{detail.followUps.map((f) => f.referenceNumber).join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ paddingTop: 16, borderTop: '1px solid var(--sb-border)', marginBottom: 16 }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>{t('supervisorWorkOrders.detail.assignments')}</Mono>
                  {detail.assignments.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', margin: 0 }}>{t('supervisorWorkOrders.labels.noAssignments')}</p>
                  ) : (
                    <div>
                      {detail.assignments.map((a) => (
                        <div key={a.id} style={{ border: '1px solid var(--sb-border)', marginBottom: 4, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px' }}>
                            <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{a.technician.name}</span>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: a.isPrincipal ? 'var(--sb-s-open-bg)' : 'var(--sb-surface)',
                              border: `1px solid ${a.isPrincipal ? 'rgba(74,122,156,0.3)' : 'var(--sb-border)'}`,
                              borderRadius: 2,
                              padding: '2px 7px',
                            }}>
                              <Mono size={8} color={a.isPrincipal ? 'var(--sb-s-open)' : 'var(--sb-text-tertiary)'}>
                                {a.isPrincipal ? t('supervisorWorkOrders.labels.principal') : t('supervisorWorkOrders.labels.contributor')}
                              </Mono>
                            </span>
                          </div>
                          {a.blockFlags.length > 0 && (
                            <div style={{ borderTop: '1px solid var(--sb-border)', padding: '8px 10px', background: 'var(--sb-surface)' }}>
                              {a.blockFlags.map((flag) => (
                                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                    <span style={{
                                      display: 'inline-block',
                                      background: flag.isResolved ? 'var(--sb-surface)' : 'var(--sb-p-crit-bg)',
                                      border: `1px solid ${flag.isResolved ? 'var(--sb-border)' : 'rgba(181,53,37,0.3)'}`,
                                      borderRadius: 2,
                                      padding: '1px 6px',
                                      flexShrink: 0,
                                    }}>
                                      <Mono size={8} color={flag.isResolved ? 'var(--sb-text-tertiary)' : 'var(--sb-p-crit)'}>
                                        {flag.isResolved ? t('supervisorWorkOrders.labels.blockResolved') : t('supervisorWorkOrders.labels.blockUnresolved')}
                                      </Mono>
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flag.reason}</span>
                                  </div>
                                  {!flag.isResolved && !isTerminalStatus(status as WorkOrderStatus) && (
                                    <button
                                      type="button"
                                      disabled={resolveBlockMutation.isPending}
                                      onClick={() => resolveBlockMutation.mutate(flag.id)}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid var(--sb-border)',
                                        borderRadius: 2,
                                        padding: '3px 8px',
                                        fontFamily: MONO,
                                        fontSize: 8,
                                        letterSpacing: '0.10em',
                                        textTransform: 'uppercase',
                                        color: 'var(--sb-text-secondary)',
                                        cursor: resolveBlockMutation.isPending ? 'not-allowed' : 'pointer',
                                        flexShrink: 0,
                                        opacity: resolveBlockMutation.isPending ? 0.5 : 1,
                                      }}
                                    >
                                      {t('supervisorWorkOrders.actions.resolveBlock')}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {detail.partRequests.length > 0 && (
                  <div style={{ paddingTop: 16, borderTop: '1px solid var(--sb-border)', marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>{t('supervisorWorkOrders.detail.partRequests')}</Mono>
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {detail.partRequests.map((pr) => {
                        const statusStyles: Record<string, { bg: string; color: string }> = {
                          FULFILLED: { bg: 'var(--sb-s-done-bg)', color: 'var(--sb-s-done)' },
                          REJECTED: { bg: 'var(--sb-p-crit-bg)', color: 'var(--sb-p-crit)' },
                          PARTIALLY_FULFILLED: { bg: 'var(--sb-s-wait-bg)', color: 'var(--sb-s-wait)' },
                        };
                        const ss = statusStyles[pr.status] ?? { bg: 'var(--sb-surface)', color: 'var(--sb-text-tertiary)' };
                        return (
                          <div key={pr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', border: '1px solid var(--sb-border)', marginBottom: 3, gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {pr.part ? pr.part.name : t('common.noData')}
                              </p>
                              {pr.part && (
                                <Mono size={8} color="var(--sb-text-tertiary)">{pr.part.referenceCode}</Mono>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <Mono size={9} color="var(--sb-text-tertiary)">{pr.quantityFulfilled ?? 0}/{pr.quantityRequested}</Mono>
                              <span style={{ display: 'inline-block', background: ss.bg, border: `1px solid ${ss.color}44`, borderRadius: 2, padding: '2px 7px' }}>
                                <Mono size={8} color={ss.color}>{t(`supervisorWorkOrders.labels.partRequestStatus.${pr.status}`)}</Mono>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detail.onHoldPeriods.length > 0 && (
                  <div style={{ paddingTop: 16, borderTop: '1px solid var(--sb-border)', marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>{t('supervisorWorkOrders.detail.holdPeriods')}</Mono>
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {detail.onHoldPeriods.map((hold) => (
                        <div key={hold.id} style={{ border: '1px solid var(--sb-border)', padding: '8px 10px', marginBottom: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>
                              {t(`supervisorWorkOrders.holdReasonType.${hold.reasonType}`, { defaultValue: hold.reasonType })}
                            </span>
                            <span style={{
                              display: 'inline-block',
                              background: hold.resumedAt ? 'var(--sb-surface)' : 'var(--sb-s-wait-bg)',
                              border: `1px solid ${hold.resumedAt ? 'var(--sb-border)' : 'rgba(122,96,32,0.3)'}`,
                              borderRadius: 2,
                              padding: '2px 7px',
                              flexShrink: 0,
                            }}>
                              <Mono size={8} color={hold.resumedAt ? 'var(--sb-text-tertiary)' : 'var(--sb-s-wait)'}>
                                {hold.resumedAt ? formatDateTime(hold.resumedAt) : t('supervisorWorkOrders.labels.holdOngoing')}
                              </Mono>
                            </span>
                          </div>
                          {hold.detail && (
                            <p style={{ fontSize: 11, color: 'var(--sb-text-secondary)', margin: '0 0 3px', lineHeight: 1.5 }}>{hold.detail}</p>
                          )}
                          <Mono size={8} color="var(--sb-text-tertiary)" block>
                            {t('supervisorWorkOrders.labels.holdStarted')}: {formatDateTime(hold.startedAt)}
                          </Mono>
                          {hold.expectedResolutionDate && (
                            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginTop: 2 }}>
                              {t('supervisorWorkOrders.labels.holdExpectedResolution')}: {formatDate(hold.expectedResolutionDate)}
                            </Mono>
                          )}
                        </div>
                      ))}
                    </div>

                    {detail.status === WorkOrderStatus.ON_HOLD && (
                      <div style={{ marginTop: 8 }}>
                        {!showHoldMetadataForm ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowHoldMetadataForm(true);
                              resetHoldMeta({
                                expectedResolutionDate: activeHoldPeriod?.expectedResolutionDate ?? '',
                                retryDate: activeHoldPeriod?.retryDate ?? '',
                                resolutionNote: activeHoldPeriod?.supervisorResolutionNote ?? '',
                                supervisorAssetStatusChoice: (activeHoldPeriod?.supervisorAssetStatusChoice ?? '') as AssetStatus | '',
                              });
                            }}
                            disabled={isMutating}
                            style={btnSecondaryStyle(isMutating)}
                          >
                            {t('supervisorWorkOrders.actions.editHoldMetadata')}
                          </button>
                        ) : (
                          <form
                            onSubmit={handleHoldMetaSubmit(handleHoldMetaFormSubmit)}
                            style={{ border: '1px solid var(--sb-border)', padding: '12px 14px', background: 'var(--sb-surface)', marginTop: 4 }}
                          >
                            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 12 }}>{t('supervisorWorkOrders.actions.editHoldMetadataTitle')}</Mono>
                            <div style={{ marginBottom: 10 }}>
                              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.holdExpectedResolution')}</Mono>
                              <input type="date" style={inputS} {...registerHoldMeta('expectedResolutionDate')} />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.holdRetryDate')}</Mono>
                              <input type="datetime-local" style={inputS} {...registerHoldMeta('retryDate')} />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.holdResolutionNote')}</Mono>
                              <input type="text" maxLength={500} style={inputS} {...registerHoldMeta('resolutionNote')} />
                            </div>
                            {requiresSupervisorAssetStatusChoice && (
                              <div style={{ marginBottom: 10 }}>
                                <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.holdAssetStatusChoice')}</Mono>
                                <select style={selectS} {...registerHoldMeta('supervisorAssetStatusChoice')}>
                                  <option value="">{t('supervisorWorkOrders.actions.assetStatusOverridePlaceholder')}</option>
                                  {[AssetStatus.OPERATIONAL, AssetStatus.OUT_OF_SERVICE, AssetStatus.IN_MAINTENANCE].map((s) => (
                                    <option key={s} value={s}>{t(`supervisorWorkOrders.labels.assetStatusOverride.${s}`)}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                              <button
                                type="submit"
                                disabled={updateHoldMetaMutation.isPending}
                                style={btnPrimaryStyle(updateHoldMetaMutation.isPending)}
                              >
                                {updateHoldMetaMutation.isPending && (
                                  <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />
                                )}
                                {t('common.save')}
                              </button>
                              <button
                                type="button"
                                style={btnSecondaryStyle()}
                                onClick={() => { setShowHoldMetadataForm(false); resetHoldMeta(); }}
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {detail.costSummary && (
                  <div style={{ paddingTop: 16, borderTop: '1px solid var(--sb-border)', marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>{t('supervisorWorkOrders.detail.costSummary')}</Mono>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sb-border)' }}>
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.costLabor')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{formatCurrency(detail.costSummary.laborCost)}</span>
                      </div>
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.costParts')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>{formatCurrency(detail.costSummary.partsCost)}</span>
                      </div>
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px', gridColumn: 'span 2' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorWorkOrders.detail.costTotal')}</Mono>
                        <span style={{ fontSize: 13, color: 'var(--sb-text-primary)', fontWeight: 700, fontFamily: MONO }}>{formatCurrency(detail.costSummary.totalCost)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {status === WorkOrderStatus.CLOSED && (
                  <div style={{ paddingTop: 16, borderTop: '1px solid var(--sb-border)' }}>
                    <button
                      type="button"
                      disabled={isDownloadingReport}
                      style={btnSecondaryStyle(isDownloadingReport)}
                      onClick={async () => {
                        setIsDownloadingReport(true);
                        try {
                          const { url } = await workOrdersApi.getReportUrl(workOrder.id);
                          window.open(url, '_blank', 'noopener,noreferrer');
                        } catch {
                          toast.error(t('supervisorWorkOrders.toasts.reportDownloadError'));
                        } finally {
                          setIsDownloadingReport(false);
                        }
                      }}
                    >
                      {isDownloadingReport
                        ? <Loader2 className="animate-spin" style={{ width: 12, height: 12, marginRight: 5 }} />
                        : <Download style={{ width: 12, height: 12, marginRight: 5 }} />}
                      {t('supervisorWorkOrders.actions.downloadReport')}
                    </button>
                  </div>
                )}

              </div>
            )}

            {activeTab === 'actions' && !isTerminalStatus(status as WorkOrderStatus) && (
              <div>

                {followUpPrompt && (
                  <div style={{ border: '1px solid rgba(58,106,140,0.4)', background: 'var(--sb-p-norm-bg)', padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)', margin: '0 0 3px' }}>{t('supervisorWorkOrders.followUp.promptTitle')}</p>
                    <p style={{ fontSize: 11, color: 'var(--sb-text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                      {t('supervisorWorkOrders.followUp.promptBody', { ref: followUpPrompt.referenceNumber })}
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        style={btnSecondaryStyle(createFollowUpMutation.isPending)}
                        disabled={createFollowUpMutation.isPending}
                        onClick={() => setFollowUpPrompt(null)}
                      >
                        {t('supervisorWorkOrders.followUp.dismiss')}
                      </button>
                      <button
                        type="button"
                        style={btnPrimaryStyle(createFollowUpMutation.isPending)}
                        disabled={createFollowUpMutation.isPending}
                        onClick={() => createFollowUpMutation.mutate({
                          type: WorkOrderType.CORRECTIVE,
                          priority: followUpPrompt.priority,
                          description: t('supervisorWorkOrders.followUp.descriptionPrefix', {
                            ref: followUpPrompt.referenceNumber,
                            original: followUpPrompt.description,
                          }),
                        })}
                      >
                        {createFollowUpMutation.isPending && (
                          <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />
                        )}
                        {t('supervisorWorkOrders.followUp.create')}
                      </button>
                    </div>
                  </div>
                )}

                {activePanel === null && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 2 }}>
                    {status === WorkOrderStatus.DRAFT && (
                      <button type="button" style={btnPrimaryStyle()} onClick={() => setActivePanel('publish')}>
                        {t('supervisorWorkOrders.actions.publish')}
                      </button>
                    )}
                    {status === WorkOrderStatus.OPEN && (
                      <button type="button" style={btnPrimaryStyle()} onClick={() => setActivePanel('assign')}>
                        {t('supervisorWorkOrders.actions.assign')}
                      </button>
                    )}
                    {(status === WorkOrderStatus.ASSIGNED ||
                      status === WorkOrderStatus.IN_PROGRESS ||
                      status === WorkOrderStatus.ON_HOLD) && (
                      <button type="button" style={btnSecondaryStyle()} onClick={() => setActivePanel('reassign')}>
                        {t('supervisorWorkOrders.actions.reassign')}
                      </button>
                    )}
                    {(status === WorkOrderStatus.ASSIGNED ||
                      status === WorkOrderStatus.IN_PROGRESS ||
                      status === WorkOrderStatus.ON_HOLD) &&
                      detail.assignments.some((a) => !a.isPrincipal && a.isActive) && (
                        <button type="button" style={btnSecondaryStyle()} onClick={() => setActivePanel('promote')}>
                          {t('supervisorWorkOrders.actions.promote')}
                        </button>
                      )}
                    {status === WorkOrderStatus.ASSIGNED && !detail.simultaneousMaintenanceAuthorized && (
                      <button type="button" style={btnSecondaryStyle()} onClick={() => setActivePanel('authorizeSim')}>
                        {t('supervisorWorkOrders.actions.authorizeSim')}
                      </button>
                    )}
                    {status === WorkOrderStatus.PENDING_VALIDATION && (
                      <>
                        <button type="button" style={btnPrimaryStyle()} onClick={() => setActivePanel('validate')}>
                          {t('supervisorWorkOrders.actions.validate')}
                        </button>
                        <button type="button" style={btnSecondaryStyle()} onClick={() => setActivePanel('reject')}>
                          {t('supervisorWorkOrders.actions.rejectClosure')}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      style={btnSecondaryStyle()}
                      onClick={() => { setNewPriority(detail.priority); setActivePanel('changePriority'); }}
                    >
                      {t('supervisorWorkOrders.actions.changePriority')}
                    </button>
                    <button type="button" style={btnDestructiveStyle()} onClick={() => setActivePanel('cancel')}>
                      {t('supervisorWorkOrders.actions.cancel')}
                    </button>
                  </div>
                )}

                {activePanel === 'publish' && (
                  <div style={actionPanelStyle}>
                    <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.publishDescription')}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(publishMutation.isPending)} onClick={resetPanels} disabled={publishMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button type="button" style={btnPrimaryStyle(publishMutation.isPending)} disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                        {publishMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.confirm')}
                      </button>
                    </div>
                  </div>
                )}

                {activePanel === 'assign' && (
                  <div style={actionPanelStyle}>
                    <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.assignDescription')}</p>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.principalTechnician')}</Mono>
                      <select style={selectS} value={principalId} onChange={(e) => setPrincipalId(e.target.value)}>
                        <option value="">{t('supervisorWorkOrders.labels.noTechnicians')}</option>
                        {technicians.map((tech) => (
                          <option key={tech.id} value={tech.id}>{tech.name}</option>
                        ))}
                      </select>
                    </div>
                    {technicians.length > 1 && (
                      <div style={{ marginBottom: 10 }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.contributorTechnicians')}</Mono>
                        <div style={{ border: '1px solid var(--sb-border)', padding: 8, maxHeight: 112, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {technicians.filter((tech) => tech.id !== principalId).map((tech) => (
                            <label key={tech.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--sb-text-primary)' }}>
                              <input
                                type="checkbox"
                                style={{ width: 13, height: 13 }}
                                checked={contributorIds.includes(tech.id)}
                                onChange={() => toggleContributor(tech.id)}
                              />
                              {tech.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(assignMutation.isPending)} onClick={resetPanels} disabled={assignMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        style={btnPrimaryStyle(assignMutation.isPending || !principalId)}
                        disabled={assignMutation.isPending || !principalId}
                        onClick={handleAssignSubmit}
                      >
                        {assignMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.confirm')}
                      </button>
                    </div>
                  </div>
                )}

                {activePanel === 'validate' && (
                  <div style={actionPanelStyle}>
                    {isCouldNotIntervene ? (
                      <>
                        <div style={{ border: '1px solid rgba(181,53,37,0.3)', background: 'var(--sb-p-crit-bg)', padding: '10px 12px', marginBottom: 12 }}>
                          <Mono size={8} color="var(--sb-p-crit)" block style={{ marginBottom: 4 }}>{t('supervisorWorkOrders.actions.couldNotInterveneWarningTitle')}</Mono>
                          <p style={{ fontSize: 11, color: 'var(--sb-p-crit)', margin: 0, lineHeight: 1.5 }}>{t('supervisorWorkOrders.actions.couldNotInterveneWarningBody')}</p>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                            {t('supervisorWorkOrders.actions.assetStatusOverrideLabel')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
                          </Mono>
                          <select
                            style={selectS}
                            value={validateAssetStatusOverride}
                            onChange={(e) => setValidateAssetStatusOverride(e.target.value as AssetStatus | '')}
                          >
                            <option value="">{t('supervisorWorkOrders.actions.assetStatusOverridePlaceholder')}</option>
                            {[AssetStatus.OPERATIONAL, AssetStatus.OUT_OF_SERVICE, AssetStatus.IN_MAINTENANCE].map((s) => (
                              <option key={s} value={s}>{t(`supervisorWorkOrders.labels.assetStatusOverride.${s}`)}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" style={btnSecondaryStyle(validateMutation.isPending)} onClick={resetPanels} disabled={validateMutation.isPending}>
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            style={btnPrimaryStyle(validateMutation.isPending || !validateAssetStatusOverride)}
                            disabled={validateMutation.isPending || !validateAssetStatusOverride}
                            onClick={() => {
                              pendingFollowUpCtxRef.current = {
                                originalWoId: detail.id,
                                assetId: detail.asset.id,
                                description: detail.description,
                                referenceNumber: detail.referenceNumber,
                                priority: detail.priority,
                              };
                              validateMutation.mutate({ assetStatusOverride: validateAssetStatusOverride as AssetStatus });
                            }}
                          >
                            {validateMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                            {t('supervisorWorkOrders.actions.validateCouldNotInterveneConfirm')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.validateDescription')}</p>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" style={btnSecondaryStyle(validateMutation.isPending)} onClick={resetPanels} disabled={validateMutation.isPending}>
                            {t('common.cancel')}
                          </button>
                          <button type="button" style={btnPrimaryStyle(validateMutation.isPending)} disabled={validateMutation.isPending} onClick={() => validateMutation.mutate({})}>
                            {validateMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                            {t('common.confirm')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activePanel === 'reject' && (
                  <form onSubmit={handleRejectSubmit(handleRejectFormSubmit)} style={actionPanelStyle}>
                    <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.rejectDescription')}</p>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.rejectionReason')}</Mono>
                      <select style={selectS} {...registerReject('rejectionReason')}>
                        {REJECTION_REASONS.map((r) => (
                          <option key={r} value={r}>{t(`supervisorWorkOrders.validationRejectionReason.${r}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.rejectionDetail')}</Mono>
                      <input type="text" placeholder={t('supervisorWorkOrders.actions.rejectionDetail')} maxLength={500} style={inputS} {...registerReject('rejectionDetail')} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(rejectMutation.isPending)} onClick={resetPanels} disabled={rejectMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button type="submit" style={btnPrimaryStyle(rejectMutation.isPending)} disabled={rejectMutation.isPending}>
                        {rejectMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.confirm')}
                      </button>
                    </div>
                  </form>
                )}

                {activePanel === 'reassign' && (
                  <form onSubmit={handleReassignSubmit(handleReassignFormSubmit)} style={actionPanelStyle}>
                    <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.reassignDescription')}</p>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.newTechnician')}</Mono>
                      <select style={selectS} {...registerReassign('newTechnicianId')}>
                        <option value="">{t('supervisorWorkOrders.labels.noTechnicians')}</option>
                        {technicians.map((tech) => (
                          <option key={tech.id} value={tech.id}>{tech.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.reassignReason')}</Mono>
                      <select style={selectS} {...registerReassign('reason')}>
                        {Object.values(WOReassignmentReason).map((r) => (
                          <option key={r} value={r}>{t(`supervisorWorkOrders.reassignmentReason.${r}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.reassignDetail')}</Mono>
                      <input type="text" maxLength={500} style={inputS} {...registerReassign('reasonDetail')} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(reassignMutation.isPending)} onClick={resetPanels} disabled={reassignMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button type="submit" style={btnPrimaryStyle(reassignMutation.isPending)} disabled={reassignMutation.isPending}>
                        {reassignMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.confirm')}
                      </button>
                    </div>
                  </form>
                )}

                {activePanel === 'promote' && (
                  <div style={actionPanelStyle}>
                    <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.promoteDescription')}</p>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.promoteNewPrincipal')}</Mono>
                      <select style={selectS} value={promoteNewPrincipalId} onChange={(e) => setPromoteNewPrincipalId(e.target.value)}>
                        <option value="">{t('supervisorWorkOrders.labels.noTechnicians')}</option>
                        {technicians
                          .filter((tech) => detail.assignments.some((a) => a.technician.id === tech.id && !a.isPrincipal && a.isActive))
                          .map((tech) => (
                            <option key={tech.id} value={tech.id}>{tech.name}</option>
                          ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.promoteReason')}</Mono>
                      <select style={selectS} value={promoteReason} onChange={(e) => setPromoteReason(e.target.value as WOReassignmentReason)}>
                        {Object.values(WOReassignmentReason).map((r) => (
                          <option key={r} value={r}>{t(`supervisorWorkOrders.reassignmentReason.${r}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.promoteReasonDetail')}</Mono>
                      <input
                        type="text"
                        style={inputS}
                        value={promoteReasonDetail}
                        onChange={(e) => setPromoteReasonDetail(e.target.value)}
                        placeholder={t('supervisorWorkOrders.actions.promoteReasonDetailPlaceholder')}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(promoteMutation.isPending)} onClick={resetPanels} disabled={promoteMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        style={btnPrimaryStyle(promoteMutation.isPending || !promoteNewPrincipalId)}
                        disabled={promoteMutation.isPending || !promoteNewPrincipalId}
                        onClick={() => promoteMutation.mutate({
                          newPrincipalId: promoteNewPrincipalId,
                          reason: promoteReason,
                          ...(promoteReasonDetail.trim() ? { reasonDetail: promoteReasonDetail.trim() } : {}),
                        })}
                      >
                        {promoteMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.confirm')}
                      </button>
                    </div>
                  </div>
                )}

                {activePanel === 'authorizeSim' && (
                  <div style={actionPanelStyle}>
                    <div style={{ border: '1px solid rgba(160,96,32,0.35)', background: 'var(--sb-p-high-bg)', padding: '10px 12px', marginBottom: 12 }}>
                      <Mono size={8} color="var(--sb-p-high)" block style={{ marginBottom: 4 }}>{t('supervisorWorkOrders.actions.authorizeSimWarningTitle')}</Mono>
                      <p style={{ fontSize: 11, color: '#5A3010', margin: 0, lineHeight: 1.5 }}>{t('supervisorWorkOrders.actions.authorizeSimWarningBody')}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(authorizeSimMutation.isPending)} onClick={resetPanels} disabled={authorizeSimMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button type="button" style={btnPrimaryStyle(authorizeSimMutation.isPending)} disabled={authorizeSimMutation.isPending} onClick={() => authorizeSimMutation.mutate()}>
                        {authorizeSimMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('supervisorWorkOrders.actions.authorizeSimConfirm')}
                      </button>
                    </div>
                  </div>
                )}

                {activePanel === 'changePriority' && (
                  <div style={actionPanelStyle}>
                    <div style={{ marginBottom: 12 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.dialog.priorityLabel')}</Mono>
                      <select style={selectS} value={newPriority} onChange={(e) => setNewPriority(e.target.value as WorkOrderPriority)}>
                        {PRIORITY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{t(`supervisorWorkOrders.priority.${opt}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(priorityMutation.isPending)} onClick={resetPanels} disabled={priorityMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button type="button" style={btnPrimaryStyle(priorityMutation.isPending)} disabled={priorityMutation.isPending} onClick={() => priorityMutation.mutate(newPriority)}>
                        {priorityMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.save')}
                      </button>
                    </div>
                  </div>
                )}

                {activePanel === 'cancel' && (
                  <form onSubmit={handleCancelSubmit(handleCancelFormSubmit)} style={actionPanelStyle}>
                    <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>{t('supervisorWorkOrders.actions.cancelDescription')}</p>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.cancellationReason')}</Mono>
                      <select style={selectS} {...registerCancel('reason')}>
                        {CANCELLATION_REASONS.map((r) => (
                          <option key={r} value={r}>{t(`supervisorWorkOrders.cancellationReason.${r}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.cancellationDetail')}</Mono>
                      <input type="text" placeholder={t('supervisorWorkOrders.actions.cancellationDetail')} maxLength={500} style={inputS} {...registerCancel('detail')} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorWorkOrders.actions.postCancellationAssetStatus')}</Mono>
                      <select style={selectS} {...registerCancel('postAssetStatus')}>
                        {[AssetStatus.OPERATIONAL, AssetStatus.OUT_OF_SERVICE, AssetStatus.IN_MAINTENANCE].map((s) => (
                          <option key={s} value={s}>{t(`supervisorWorkOrders.labels.assetStatusOverride.${s}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={btnSecondaryStyle(cancelMutation.isPending)} onClick={resetPanels} disabled={cancelMutation.isPending}>
                        {t('common.cancel')}
                      </button>
                      <button type="submit" style={btnDestructiveStyle(cancelMutation.isPending)} disabled={cancelMutation.isPending}>
                        {cancelMutation.isPending && <Loader2 className="animate-spin" style={{ width: 11, height: 11, marginRight: 5 }} />}
                        {t('common.confirm')}
                      </button>
                    </div>
                  </form>
                )}

              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
