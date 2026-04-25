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
  WOCancellationReason,
  WOReassignmentReason,
  ValidationRejectionReason,
  AssetStatus,
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
import { InterventionResult } from '@gmao/shared';
import { usersApi } from '@/lib/users.api';
import {
  getContributorWithoutLogNames,
  getTimeDeviationPresentation,
} from '@/lib/work-order-validation-insights';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getStatusBadgeVariant(
  status: WorkOrderStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (status === WorkOrderStatus.CLOSED) return 'success';
  if (status === WorkOrderStatus.CANCELLED) return 'destructive';
  if (
    status === WorkOrderStatus.IN_PROGRESS ||
    status === WorkOrderStatus.PENDING_VALIDATION
  )
    return 'warning';
  if (status === WorkOrderStatus.ON_HOLD) return 'outline';
  return 'secondary';
}

function getPriorityBadgeVariant(
  priority: WorkOrderPriority,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (priority === WorkOrderPriority.CRITICAL) return 'destructive';
  if (priority === WorkOrderPriority.HIGH) return 'warning';
  if (priority === WorkOrderPriority.MEDIUM) return 'secondary';
  return 'outline';
}

function isTerminalStatus(status: WorkOrderStatus): boolean {
  return status === WorkOrderStatus.CLOSED || status === WorkOrderStatus.CANCELLED;
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

const CANCELLATION_REASONS = Object.values(WOCancellationReason);
const REJECTION_REASONS = Object.values(ValidationRejectionReason);

// ── Action panel types ────────────────────────────────────────────────────────

type ActionPanel =
  | 'publish'
  | 'assign'
  | 'reassign'
  | 'promote'
  | 'validate'
  | 'reject'
  | 'cancel'
  | 'authorizeSim'
  | null;

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Full list item or a minimal object with just `id` (used for deep-link open,
   * where the full detail is fetched from the server by the internal query).
   */
  workOrder: WorkOrderListItem | { id: string } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkOrderDetailDialog({
  open,
  onOpenChange,
  workOrder,
}: WorkOrderDetailDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<ActionPanel>(null);

  // Assign form state
  const [principalId, setPrincipalId] = useState('');
  const [contributorIds, setContributorIds] = useState<string[]>([]);

  // Validate (COULD_NOT_INTERVENE) form state
  const [validateAssetStatusOverride, setValidateAssetStatusOverride] =
    useState<AssetStatus | ''>('');

  // Follow-up WO prompt state — populated after a COULD_NOT_INTERVENE validation succeeds
  const [followUpPrompt, setFollowUpPrompt] = useState<{
    originalWoId: string;
    assetId: string;
    description: string;
    referenceNumber: string;
    priority: WorkOrderPriority;
  } | null>(null);

  // Captured just before validateMutation fires to survive the detail re-fetch
  const pendingFollowUpCtxRef = useRef<typeof followUpPrompt>(null);

  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  // Promote form state
  const [promoteNewPrincipalId, setPromoteNewPrincipalId] = useState('');
  const [promoteReason, setPromoteReason] = useState<WOReassignmentReason>(WOReassignmentReason.TECHNICIAN_ABSENT);
  const [promoteReasonDetail, setPromoteReasonDetail] = useState('');

  // Cancel form state
  const { register: registerCancel, handleSubmit: handleCancelSubmit, reset: resetCancel } =
    useForm<{ reason: WOCancellationReason; detail: string; postAssetStatus: string }>({
      defaultValues: {
        reason: WOCancellationReason.CREATED_IN_ERROR,
        detail: '',
        postAssetStatus: AssetStatus.OPERATIONAL,
      },
    });

  // Reject form state
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

  // Reassign form state
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

  // Hold metadata form state (supervisor)
  const [showHoldMetadataForm, setShowHoldMetadataForm] = useState(false);
  const {
    register: registerHoldMeta,
    handleSubmit: handleHoldMetaSubmit,
    reset: resetHoldMeta,
  } = useForm<{ expectedResolutionDate: string; retryDate: string; resolutionNote: string }>({
    defaultValues: { expectedResolutionDate: '', retryDate: '', resolutionNote: '' },
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'work-orders', workOrder?.id, 'detail'],
    queryFn: () => workOrdersApi.getById(workOrder!.id),
    enabled: open && !!workOrder?.id,
  });

  const { data: techniciansData } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: () => usersApi.list({ role: Role.TECHNICIAN, isActive: true }),
    enabled: open && (activePanel === 'assign' || activePanel === 'reassign' || activePanel === 'promote'),
  });

  const technicians = techniciansData ?? [];

  // ── Invalidation helper ────────────────────────────────────────────────────

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'work-orders'] });
    void queryClient.invalidateQueries({
      queryKey: ['supervisor', 'work-orders', workOrder?.id, 'detail'],
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

  // ── Mutations ──────────────────────────────────────────────────────────────

  const publishMutation = useMutation({
    mutationFn: () => workOrdersApi.publish(workOrder!.id),
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
      workOrdersApi.assign(workOrder!.id, payload),
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
      workOrdersApi.validate(workOrder!.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.validateSuccess'));
      setActivePanel(null);
      setValidateAssetStatusOverride('');
      // If this was a COULD_NOT_INTERVENE validation, show the follow-up prompt
      if (pendingFollowUpCtxRef.current) {
        setFollowUpPrompt(pendingFollowUpCtxRef.current);
        pendingFollowUpCtxRef.current = null;
      }
    },
    onError: (err) => {
      pendingFollowUpCtxRef.current = null;
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.validateError')));
    },
  });

  const createFollowUpMutation = useMutation({
    mutationFn: (payload: CreateFollowUpPayload) =>
      workOrdersApi.createFollowUp(followUpPrompt!.originalWoId, payload),
    onSuccess: (newWo) => {
      invalidateAll();
      setFollowUpPrompt(null);
      toast.success(
        t('supervisorWorkOrders.toasts.followUpCreated', {
          ref: newWo.referenceNumber,
        }),
      );
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.followUpError'))),
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: RejectValidationPayload) =>
      workOrdersApi.reject(workOrder!.id, payload),
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
      workOrdersApi.cancel(workOrder!.id, payload),
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
      workOrdersApi.reassign(workOrder!.id, payload),
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
      workOrdersApi.promote(workOrder!.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.promoteSuccess'));
      resetPanels();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.promoteError'))),
  });

  const resolveBlockMutation = useMutation({
    mutationFn: (blockId: string) =>
      workOrdersApi.resolveBlock(workOrder!.id, blockId),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.resolveBlockSuccess'));
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.resolveBlockError'))),
  });

  const authorizeSimMutation = useMutation({
    mutationFn: () => workOrdersApi.authorizeSimultaneous(workOrder!.id),
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
      workOrdersApi.updateHoldMetadata(workOrder!.id, payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('supervisorWorkOrders.toasts.holdMetaSuccess'));
      setShowHoldMetadataForm(false);
      resetHoldMeta();
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t('supervisorWorkOrders.toasts.holdMetaError'))),
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

  // ── Action submit handlers ─────────────────────────────────────────────────

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
  }) => {
    const payload: UpdateHoldMetadataPayload = {};
    if (values.expectedResolutionDate) payload.expectedResolutionDate = values.expectedResolutionDate;
    if (values.retryDate) payload.retryDate = values.retryDate;
    if (values.resolutionNote.trim()) payload.resolutionNote = values.resolutionNote.trim();
    updateHoldMetaMutation.mutate(payload);
  };

  // Toggle contributor selection
  const toggleContributor = (id: string) => {
    setContributorIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const status =
    detail?.status ??
    (workOrder && 'status' in workOrder ? (workOrder as WorkOrderListItem).status : undefined);

  /**
   * True when the most recently completed intervention log reported that the
   * technician could not carry out the work. In that case the supervisor must
   * explicitly choose an asset status instead of defaulting to OPERATIONAL.
   */
  const lastCompletedIntervention = detail?.interventionLogs
    ?.filter((l) => l.endedAt !== null && l.result !== null)
    .sort(
      (a, b) =>
        new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime(),
    )[0] ?? null;

  const isCouldNotIntervene =
    lastCompletedIntervention?.result === InterventionResult.COULD_NOT_INTERVENE;

  const contributorsWithoutLog = detail?.contributorsWithoutLog ?? [];
  const hasContributorsWithoutLog = contributorsWithoutLog.length > 0;
  const hasNotableTimeDeviation = detail?.hasNotableTimeDeviation ?? false;
  const timeDeviation = detail?.timeDeviation;
  const timeDeviationPresentation = getTimeDeviationPresentation(timeDeviation);

  const renderActionPanel = () => {
    if (!detail || !status || isTerminalStatus(status)) return null;

    return (
      <>
        <Separator />
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.actions')}</p>
            <p className="text-xs text-muted-foreground">
              {t('supervisorWorkOrders.detail.actionsDescription')}
            </p>
          </div>

          {activePanel === null && (
            <div className="flex flex-wrap gap-2">
              {/* DRAFT → publish */}
              {status === WorkOrderStatus.DRAFT && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActivePanel('publish')}
                >
                  {t('supervisorWorkOrders.actions.publish')}
                </Button>
              )}

              {/* OPEN → assign */}
              {status === WorkOrderStatus.OPEN && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActivePanel('assign')}
                >
                  {t('supervisorWorkOrders.actions.assign')}
                </Button>
              )}

              {/* ASSIGNED / IN_PROGRESS / ON_HOLD → reassign principal */}
              {(status === WorkOrderStatus.ASSIGNED ||
                status === WorkOrderStatus.IN_PROGRESS ||
                status === WorkOrderStatus.ON_HOLD) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setActivePanel('reassign')}
                >
                  {t('supervisorWorkOrders.actions.reassign')}
                </Button>
              )}

              {/* ASSIGNED / IN_PROGRESS / ON_HOLD → promote contributor if any */}
              {(status === WorkOrderStatus.ASSIGNED ||
                status === WorkOrderStatus.IN_PROGRESS ||
                status === WorkOrderStatus.ON_HOLD) &&
                detail.assignments.some((a) => !a.isPrincipal && a.isActive) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActivePanel('promote')}
                  >
                    {t('supervisorWorkOrders.actions.promote')}
                  </Button>
                )}

              {/* ASSIGNED → authorize simultaneous maintenance (only when not yet authorized) */}
              {status === WorkOrderStatus.ASSIGNED &&
                detail &&
                !detail.simultaneousMaintenanceAuthorized && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActivePanel('authorizeSim')}
                  >
                    {t('supervisorWorkOrders.actions.authorizeSim')}
                  </Button>
                )}

              {/* PENDING_VALIDATION → validate or reject */}
              {status === WorkOrderStatus.PENDING_VALIDATION && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActivePanel('validate')}
                  >
                    {t('supervisorWorkOrders.actions.validate')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActivePanel('reject')}
                  >
                    {t('supervisorWorkOrders.actions.rejectClosure')}
                  </Button>
                </>
              )}

              {/* Any non-terminal → cancel */}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setActivePanel('cancel')}
              >
                {t('supervisorWorkOrders.actions.cancel')}
              </Button>
            </div>
          )}

          {/* ── Publish panel ── */}
          {activePanel === 'publish' && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm">{t('supervisorWorkOrders.actions.publishDescription')}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={publishMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={publishMutation.isPending}
                  onClick={() => publishMutation.mutate()}
                >
                  {publishMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Assign panel ── */}
          {activePanel === 'assign' && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm">{t('supervisorWorkOrders.actions.assignDescription')}</p>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.principalTechnician')}</Label>
                <select
                  className={selectClass}
                  value={principalId}
                  onChange={(e) => setPrincipalId(e.target.value)}
                >
                  <option value="">{t('supervisorWorkOrders.labels.noTechnicians')}</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>

              {technicians.length > 1 && (
                <div className="space-y-1.5">
                  <Label>{t('supervisorWorkOrders.actions.contributorTechnicians')}</Label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto rounded-md border p-2">
                    {technicians
                      .filter((t) => t.id !== principalId)
                      .map((tech) => (
                        <label key={tech.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={contributorIds.includes(tech.id)}
                            onChange={() => toggleContributor(tech.id)}
                          />
                          {tech.name}
                        </label>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={assignMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={assignMutation.isPending || !principalId}
                  onClick={handleAssignSubmit}
                >
                  {assignMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Validate panel ── */}
          {activePanel === 'validate' && (
            <div className="space-y-3 rounded-md border p-3">
              {isCouldNotIntervene ? (
                <>
                  {/* Warning banner — technician reported they could not intervene */}
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <p className="font-semibold">
                      {t('supervisorWorkOrders.actions.couldNotInterveneWarningTitle')}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {t('supervisorWorkOrders.actions.couldNotInterveneWarningBody')}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      {t('supervisorWorkOrders.actions.assetStatusOverrideLabel')}
                      <span className="ml-1 text-destructive">*</span>
                    </Label>
                    <select
                      className={selectClass}
                      value={validateAssetStatusOverride}
                      onChange={(e) =>
                        setValidateAssetStatusOverride(e.target.value as AssetStatus | '')
                      }
                    >
                      <option value="">
                        {t('supervisorWorkOrders.actions.assetStatusOverridePlaceholder')}
                      </option>
                      <option value={AssetStatus.OPERATIONAL}>
                        {t('supervisorWorkOrders.labels.assetStatusOverride.OPERATIONAL')}
                      </option>
                      <option value={AssetStatus.OUT_OF_SERVICE}>
                        {t('supervisorWorkOrders.labels.assetStatusOverride.OUT_OF_SERVICE')}
                      </option>
                      <option value={AssetStatus.IN_MAINTENANCE}>
                        {t('supervisorWorkOrders.labels.assetStatusOverride.IN_MAINTENANCE')}
                      </option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetPanels}
                      disabled={validateMutation.isPending}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={validateMutation.isPending || !validateAssetStatusOverride}
                      onClick={() => {
                        // Capture context before the WO detail is re-fetched post-mutation
                        if (detail) {
                          pendingFollowUpCtxRef.current = {
                            originalWoId: detail.id,
                            assetId: detail.asset.id,
                            description: detail.description,
                            referenceNumber: detail.referenceNumber,
                            priority: detail.priority,
                          };
                        }
                        validateMutation.mutate({
                          assetStatusOverride: validateAssetStatusOverride as AssetStatus,
                        });
                      }}
                    >
                      {validateMutation.isPending && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      {t('supervisorWorkOrders.actions.validateCouldNotInterveneConfirm')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    {t('supervisorWorkOrders.actions.validateDescription')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetPanels}
                      disabled={validateMutation.isPending}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={validateMutation.isPending}
                      onClick={() => validateMutation.mutate({})}
                    >
                      {validateMutation.isPending && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      {t('common.confirm')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Follow-up WO prompt — appears after a COULD_NOT_INTERVENE validation (§9.5) ── */}
          {followUpPrompt && (
            <div className="space-y-3 rounded-md border border-yellow-400/60 bg-yellow-50/40 p-3 dark:bg-yellow-900/10">
              <div>
                <p className="text-sm font-semibold">
                  {t('supervisorWorkOrders.followUp.promptTitle')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('supervisorWorkOrders.followUp.promptBody', {
                    ref: followUpPrompt.referenceNumber,
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={createFollowUpMutation.isPending}
                  onClick={() => setFollowUpPrompt(null)}
                >
                  {t('supervisorWorkOrders.followUp.dismiss')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={createFollowUpMutation.isPending}
                  onClick={() =>
                    createFollowUpMutation.mutate({
                      type: 'CORRECTIVE' as const,
                      priority: followUpPrompt.priority,
                      description: t('supervisorWorkOrders.followUp.descriptionPrefix', {
                        ref: followUpPrompt.referenceNumber,
                        original: followUpPrompt.description,
                      }),
                    } as CreateFollowUpPayload)
                  }
                >
                  {createFollowUpMutation.isPending && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  {t('supervisorWorkOrders.followUp.create')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Reject closure panel ── */}
          {activePanel === 'reject' && (
            <form
              onSubmit={handleRejectSubmit(handleRejectFormSubmit)}
              className="space-y-3 rounded-md border p-3"
            >
              <p className="text-sm">{t('supervisorWorkOrders.actions.rejectClosureDescription')}</p>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.rejectionReason')}</Label>
                <select className={selectClass} {...registerReject('rejectionReason')}>
                  {REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`supervisorWorkOrders.validationRejectionReason.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.rejectionDetail')}</Label>
                <Input
                  placeholder={t('supervisorWorkOrders.actions.rejectionDetail')}
                  maxLength={500}
                  {...registerReject('rejectionDetail')}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={rejectMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit" size="sm" disabled={rejectMutation.isPending}>
                  {rejectMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('common.confirm')}
                </Button>
              </div>
            </form>
          )}

          {/* ── Reassign panel ── */}
          {activePanel === 'reassign' && (
            <form
              onSubmit={handleReassignSubmit(handleReassignFormSubmit)}
              className="space-y-3 rounded-md border p-3"
            >
              <p className="text-sm">{t('supervisorWorkOrders.actions.reassignDescription')}</p>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.newTechnician')}</Label>
                <select className={selectClass} {...registerReassign('newTechnicianId')}>
                  <option value="">{t('supervisorWorkOrders.labels.noTechnicians')}</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.reassignReason')}</Label>
                <select className={selectClass} {...registerReassign('reason')}>
                  {Object.values(WOReassignmentReason).map((r) => (
                    <option key={r} value={r}>
                      {t(`supervisorWorkOrders.reassignmentReason.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.reassignReasonDetail')}</Label>
                <Input
                  placeholder={t('supervisorWorkOrders.actions.reassignReasonDetail')}
                  maxLength={500}
                  {...registerReassign('reasonDetail')}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={reassignMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit" size="sm" disabled={reassignMutation.isPending}>
                  {reassignMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('common.confirm')}
                </Button>
              </div>
            </form>
          )}

          {/* ── Promote panel ── */}
          {activePanel === 'promote' && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm">{t('supervisorWorkOrders.actions.promoteDescription')}</p>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.newPrincipalContributor')}</Label>
                <select
                  className={selectClass}
                  value={promoteNewPrincipalId}
                  onChange={(e) => setPromoteNewPrincipalId(e.target.value)}
                >
                  <option value="">{t('supervisorWorkOrders.labels.noTechnicians')}</option>
                  {detail.assignments
                    .filter((a) => !a.isPrincipal && a.isActive)
                    .map((a) => (
                      <option key={a.id} value={a.technicianId}>
                        {a.technician.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.promoteReason')}</Label>
                <select
                  className={selectClass}
                  value={promoteReason}
                  onChange={(e) => setPromoteReason(e.target.value as WOReassignmentReason)}
                >
                  {Object.values(WOReassignmentReason).map((r) => (
                    <option key={r} value={r}>
                      {t(`supervisorWorkOrders.reassignmentReason.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.promoteReasonDetail')}</Label>
                <input
                  type="text"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={promoteReasonDetail}
                  onChange={(e) => setPromoteReasonDetail(e.target.value)}
                  placeholder={t('supervisorWorkOrders.actions.promoteReasonDetailPlaceholder')}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={promoteMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={promoteMutation.isPending || !promoteNewPrincipalId}
                  onClick={() =>
                    promoteMutation.mutate({
                      newPrincipalId: promoteNewPrincipalId,
                      reason: promoteReason,
                      ...(promoteReasonDetail.trim() ? { reasonDetail: promoteReasonDetail.trim() } : {}),
                    })
                  }
                >
                  {promoteMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Authorize simultaneous maintenance panel ── */}
          {activePanel === 'authorizeSim' && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                <p className="font-semibold">
                  {t('supervisorWorkOrders.actions.authorizeSimWarningTitle')}
                </p>
                <p className="mt-0.5 text-xs">
                  {t('supervisorWorkOrders.actions.authorizeSimWarningBody')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={authorizeSimMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={authorizeSimMutation.isPending}
                  onClick={() => authorizeSimMutation.mutate()}
                >
                  {authorizeSimMutation.isPending && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  {t('supervisorWorkOrders.actions.authorizeSimConfirm')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Cancel panel ── */}
          {activePanel === 'cancel' && (
            <form
              onSubmit={handleCancelSubmit(handleCancelFormSubmit)}
              className="space-y-3 rounded-md border p-3"
            >
              <p className="text-sm">{t('supervisorWorkOrders.actions.cancelDescription')}</p>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.cancellationReason')}</Label>
                <select className={selectClass} {...registerCancel('reason')}>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`supervisorWorkOrders.cancellationReason.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.actions.cancellationDetail')}</Label>
                <Input
                  placeholder={t('supervisorWorkOrders.actions.cancellationDetail')}
                  maxLength={500}
                  {...registerCancel('detail')}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('supervisorWorkOrders.labels.postCancellationAsset')}</Label>
                <select className={selectClass} {...registerCancel('postAssetStatus')}>
                  <option value={AssetStatus.OPERATIONAL}>
                    {t('supervisorWorkOrders.labels.assetStatusAfterCancel.OPERATIONAL')}
                  </option>
                  <option value={AssetStatus.OUT_OF_SERVICE}>
                    {t('supervisorWorkOrders.labels.assetStatusAfterCancel.OUT_OF_SERVICE')}
                  </option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetPanels}
                  disabled={cancelMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="destructive"
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('common.confirm')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetPanels();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('supervisorWorkOrders.detail.title')}</DialogTitle>
          {workOrder && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {'referenceNumber' in workOrder && workOrder.referenceNumber && (
                <span className="text-sm font-mono font-medium">{workOrder.referenceNumber}</span>
              )}
              {status && (
                <Badge variant={getStatusBadgeVariant(status as WorkOrderStatus)}>
                  {t(`supervisorWorkOrders.status.${status}`)}
                </Badge>
              )}
              {'priority' in workOrder && workOrder.priority && (
                <Badge variant={getPriorityBadgeVariant(workOrder.priority as WorkOrderPriority)}>
                  {t(`supervisorWorkOrders.priority.${workOrder.priority}`)}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {t('supervisorWorkOrders.states.detailError')}
          </p>
        ) : detail ? (
          <div className="space-y-6">

            {/* ── General info ── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.asset')}</p>
                <p className="font-medium">{detail.asset.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.location')}</p>
                <p className="font-medium">{detail.asset.location.fullPath}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.type')}</p>
                <p className="font-medium">{t(`supervisorWorkOrders.types.${detail.type}`)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.source')}</p>
                <p className="font-medium">{t(`supervisorWorkOrders.labels.sourceType.${detail.sourceType}`)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.dueDate')}</p>
                <p className="font-medium">{formatDate(detail.dueDate)}</p>
              </div>
              {detail.estimatedDurationMinutes != null && (
                <div>
                  <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.estimatedDuration')}</p>
                  <p className="font-medium">
                    {t('supervisorWorkOrders.detail.estimatedDurationValue', {
                      count: detail.estimatedDurationMinutes,
                    })}
                  </p>
                </div>
              )}
              {detail.closedAt && (
                <div>
                  <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.closedAt')}</p>
                  <p className="font-medium">{formatDateTime(detail.closedAt)}</p>
                </div>
              )}
              {detail.cancelledAt && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.cancelledAt')}</p>
                    <p className="font-medium">{formatDateTime(detail.cancelledAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.cancellationReason')}</p>
                    <p className="font-medium">
                      {detail.cancellationReason
                        ? t(`supervisorWorkOrders.cancellationReason.${detail.cancellationReason}`)
                        : '—'}
                    </p>
                  </div>
                </>
              )}
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.description')}</p>
                <p className="whitespace-pre-wrap">{detail.description}</p>
              </div>
              {detail.internalNotes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.internalNotes')}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detail.internalNotes}</p>
                </div>
              )}
            </div>

            {/* Source problem report */}
            {detail.sourceReport && (
              <div className="mt-4 rounded-md border border-muted bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('supervisorWorkOrders.detail.sourceReport')}
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.sourceReportRef')}</p>
                    <p className="font-medium">{detail.sourceReport.referenceNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.sourceReportReporter')}</p>
                    <p className="font-medium">{detail.sourceReport.reporter.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.sourceReportUrgency')}</p>
                    <p className="font-medium">
                      {t(`supervisorReports.urgency.${detail.sourceReport.urgencyPerception}`)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.sourceReportDate')}</p>
                    <p className="font-medium">{formatDateTime(detail.sourceReport.createdAt)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.sourceReportDescription')}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{detail.sourceReport.description}</p>
                  </div>
                </div>
              </div>
            )}

            {(status === WorkOrderStatus.PENDING_VALIDATION &&
              (hasContributorsWithoutLog || hasNotableTimeDeviation)) && (
              <div className="rounded-md border border-amber-400/60 bg-amber-50/40 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  {t('supervisorWorkOrders.detail.validationSignalsTitle')}
                </p>

                {hasContributorsWithoutLog && (
                  <div className="text-sm">
                    <p className="font-medium text-amber-900">
                      {t('supervisorWorkOrders.detail.contributorsWithoutLogTitle')}
                    </p>
                    <p className="text-amber-900/90">
                      {t('supervisorWorkOrders.detail.contributorsWithoutLogDescription', {
                        names: getContributorWithoutLogNames(contributorsWithoutLog),
                      })}
                    </p>
                  </div>
                )}

                {hasNotableTimeDeviation && timeDeviation && (
                  <div className="text-sm">
                    <p className="font-medium text-amber-900">
                      {t('supervisorWorkOrders.detail.timeDeviationTitle')}
                    </p>
                    <p className="text-amber-900/90">
                      {t('supervisorWorkOrders.detail.timeDeviationDescription', {
                        estimated: timeDeviation.estimatedDurationMinutes ?? 0,
                        actual: timeDeviation.actualDurationMinutes,
                        deltaMinutes: timeDeviationPresentation.absoluteDeviationMinutes ?? 0,
                        deltaPercent: timeDeviationPresentation.absoluteDeviationPercent ?? 0,
                        direction: t(
                          `supervisorWorkOrders.detail.timeDeviationDirection.${timeDeviationPresentation.direction}`,
                        ),
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Follow-up cross-references (§8.8) ── */}
            {(detail.followUpFrom || (detail.followUps && detail.followUps.length > 0)) && (
              <div className="mt-4 rounded-md border border-muted bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('supervisorWorkOrders.detail.followUpChain')}
                </p>
                {detail.followUpFrom && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {t('supervisorWorkOrders.detail.followUpFrom')}
                    </span>{' '}
                    <span className="font-medium">{detail.followUpFrom.referenceNumber}</span>
                  </p>
                )}
                {detail.followUps && detail.followUps.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {t('supervisorWorkOrders.detail.followUps')}
                    </span>{' '}
                    <span className="font-medium">
                      {detail.followUps.map((f) => f.referenceNumber).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* ── Assignments ── */}
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.assignments')}</p>
              <p className="text-xs text-muted-foreground">
                {t('supervisorWorkOrders.detail.assignmentsDescription')}
              </p>
              {detail.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('supervisorWorkOrders.labels.noAssignments')}
                </p>
              ) : (
                <div className="space-y-2">
                  {detail.assignments.map((a) => (
                    <div key={a.id} className="rounded-md border text-sm overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="font-medium">{a.technician.name}</span>
                        <Badge variant={a.isPrincipal ? 'default' : 'secondary'}>
                          {a.isPrincipal
                            ? t('supervisorWorkOrders.labels.principal')
                            : t('supervisorWorkOrders.labels.contributor')}
                        </Badge>
                      </div>
                      {a.blockFlags.length > 0 && (
                        <div className="border-t px-3 py-2 space-y-1.5 bg-muted/40">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('supervisorWorkOrders.labels.blockFlags')}
                          </p>
                          {a.blockFlags.map((flag) => (
                            <div
                              key={flag.id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Badge
                                  variant={flag.isResolved ? 'secondary' : 'destructive'}
                                  className="text-[10px] px-1.5 py-0 shrink-0"
                                >
                                  {flag.isResolved
                                    ? t('supervisorWorkOrders.labels.blockResolved')
                                    : t('supervisorWorkOrders.labels.blockUnresolved')}
                                </Badge>
                                <span className="truncate text-muted-foreground">{flag.reason}</span>
                              </div>
                              {!flag.isResolved && !isTerminalStatus(status as WorkOrderStatus) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] shrink-0"
                                  disabled={resolveBlockMutation.isPending}
                                  onClick={() => resolveBlockMutation.mutate(flag.id)}
                                >
                                  {t('supervisorWorkOrders.actions.resolveBlock')}
                                </Button>
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

            {/* ── Checklist ── */}
            {detail.checklistItems.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.checklist')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('supervisorWorkOrders.detail.checklistDescription')}
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detail.checklistItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border px-3 py-2 text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5 flex-1">
                            <p className="font-medium">{item.description}</p>
                            {item.expectedCondition && (
                              <p className="text-muted-foreground">{item.expectedCondition}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.isMandatory && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {t('supervisorWorkOrders.labels.mandatory')}
                              </Badge>
                            )}
                            <Badge
                              variant={
                                item.status === 'DONE'
                                  ? 'success'
                                  : item.status === 'ANOMALY_DETECTED'
                                  ? 'destructive'
                                  : item.status === 'NOT_APPLICABLE'
                                  ? 'secondary'
                                  : 'outline'
                              }
                              className="text-[10px] px-1.5 py-0"
                            >
                              {t(`supervisorWorkOrders.labels.checklistStatus.${item.status}`, { defaultValue: item.status })}
                            </Badge>
                          </div>
                        </div>
                        {item.anomalyDescription && (
                          <p className="text-destructive/80 pt-0.5">
                            {t('supervisorWorkOrders.labels.checklistAnomalyDescription')}: {item.anomalyDescription}
                          </p>
                        )}
                        {item.notApplicableReason && (
                          <p className="text-muted-foreground pt-0.5">
                            {t('supervisorWorkOrders.labels.checklistNotApplicableReason')}: {item.notApplicableReason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Validation history ── */}
            {detail.validationActions.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {t('supervisorWorkOrders.detail.validationHistory')}
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {detail.validationActions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-start justify-between rounded-md border px-3 py-2 text-xs gap-3"
                      >
                        <div className="space-y-0.5">
                          <Badge
                            variant={v.action === 'APPROVED' ? 'success' : 'destructive'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {v.action}
                          </Badge>
                          {v.rejectionReason && (
                            <p className="text-muted-foreground">
                              {t(`supervisorWorkOrders.validationRejectionReason.${v.rejectionReason}`)}
                              {v.rejectionDetail ? ` — ${v.rejectionDetail}` : ''}
                            </p>
                          )}
                        </div>
                        <p className="text-muted-foreground shrink-0">
                          {formatDateTime(v.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Intervention logs ── */}
            {detail.interventionLogs.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.interventions')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('supervisorWorkOrders.detail.interventionsDescription')}
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detail.interventionLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-md border px-3 py-2 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="font-medium">{log.technician.name}</p>
                            {log.isReassignmentRemnant && (
                              <span className="shrink-0 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {t('supervisorWorkOrders.detail.interventionRemnant')}
                              </span>
                            )}
                          </div>
                          {log.activeDurationMinutes != null && (
                            <span className="text-muted-foreground shrink-0">
                              {t('supervisorWorkOrders.labels.interventionDurationValue', {
                                count: log.activeDurationMinutes,
                              })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>
                            {t('supervisorWorkOrders.labels.interventionStarted')}: {formatDateTime(log.startedAt)}
                          </span>
                          <span>
                            {log.endedAt
                              ? `${t('supervisorWorkOrders.labels.interventionEnded')}: ${formatDateTime(log.endedAt)}`
                              : t('supervisorWorkOrders.labels.interventionInProgress')}
                          </span>
                        </div>
                        {log.result && (
                          <p className="text-muted-foreground">
                            {log.result}{log.resultExplanation ? ` — ${log.resultExplanation}` : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Cost Summary ── */}
            {detail.costSummary && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.costSummary')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('supervisorWorkOrders.detail.costSummaryDescription')}
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.costLabor')}</p>
                      <p className="font-medium">{formatCurrency(detail.costSummary.laborCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.costParts')}</p>
                      <p className="font-medium">{formatCurrency(detail.costSummary.partsCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.costContractor')}</p>
                      <p className="font-medium">{formatCurrency(detail.costSummary.contractorCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('supervisorWorkOrders.detail.costTotal')}</p>
                      <p className="font-semibold">{formatCurrency(detail.costSummary.totalCost)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── On-hold periods ── */}
            {detail.onHoldPeriods.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.holdPeriods')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('supervisorWorkOrders.detail.holdPeriodsDescription')}
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detail.onHoldPeriods.map((hold) => (
                      <div
                        key={hold.id}
                        className="rounded-md border px-3 py-2 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">
                            {t(`supervisorWorkOrders.holdReasonType.${hold.reasonType}`, { defaultValue: hold.reasonType })}
                          </p>
                          <Badge
                            variant={hold.resumedAt ? 'secondary' : 'warning'}
                            className="text-[10px] px-1.5 py-0 shrink-0"
                          >
                            {hold.resumedAt
                              ? formatDateTime(hold.resumedAt)
                              : t('supervisorWorkOrders.labels.holdOngoing')}
                          </Badge>
                        </div>
                        {hold.detail && (
                          <p className="text-muted-foreground">{hold.detail}</p>
                        )}
                        <p className="text-muted-foreground">
                          {t('supervisorWorkOrders.labels.holdStarted')}: {formatDateTime(hold.startedAt)}
                        </p>
                        {hold.expectedResolutionDate && (
                          <p className="text-muted-foreground">
                            {t('supervisorWorkOrders.labels.holdExpectedResolution')}: {formatDate(hold.expectedResolutionDate)}
                          </p>
                        )}
                        {hold.retryDate && (
                          <p className="text-muted-foreground">
                            {t('supervisorWorkOrders.labels.holdRetryDate')}: {formatDateTime(hold.retryDate)}
                          </p>
                        )}
                        {hold.supervisorResolutionNote && (
                          <p className="text-muted-foreground">
                            <span className="font-medium">{t('supervisorWorkOrders.labels.holdSupervisorNote')}: </span>
                            {hold.supervisorResolutionNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Supervisor hold management form — only shown when WO is ON_HOLD */}
                  {detail.status === WorkOrderStatus.ON_HOLD && (
                    <div className="pt-1">
                      {!showHoldMetadataForm ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowHoldMetadataForm(true)}
                          disabled={isMutating}
                        >
                          {t('supervisorWorkOrders.actions.editHoldMetadata')}
                        </Button>
                      ) : (
                        <form
                          onSubmit={handleHoldMetaSubmit(handleHoldMetaFormSubmit)}
                          className="rounded-md border p-3 space-y-3 bg-muted/30"
                        >
                          <p className="text-xs font-medium">
                            {t('supervisorWorkOrders.actions.editHoldMetadataTitle')}
                          </p>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {t('supervisorWorkOrders.actions.holdExpectedResolution')}
                            </Label>
                            <Input
                              type="datetime-local"
                              className="h-8 text-xs"
                              {...registerHoldMeta('expectedResolutionDate')}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {t('supervisorWorkOrders.actions.holdRetryDate')}
                            </Label>
                            <Input
                              type="datetime-local"
                              className="h-8 text-xs"
                              {...registerHoldMeta('retryDate')}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {t('supervisorWorkOrders.actions.holdResolutionNote')}
                            </Label>
                            <Input
                              type="text"
                              className="h-8 text-xs"
                              placeholder={t('supervisorWorkOrders.actions.holdResolutionNotePlaceholder')}
                              {...registerHoldMeta('resolutionNote')}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              size="sm"
                              disabled={updateHoldMetaMutation.isPending}
                            >
                              {updateHoldMetaMutation.isPending && (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              )}
                              {t('common.save')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowHoldMetadataForm(false);
                                resetHoldMeta();
                              }}
                            >
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Part requests ── */}
            {detail.partRequests.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.partRequests')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('supervisorWorkOrders.detail.partRequestsDescription')}
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {detail.partRequests.map((pr) => (
                      <div
                        key={pr.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-xs gap-3"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {pr.part ? pr.part.name : t('common.noData')}
                          </p>
                          {pr.part && (
                            <p className="text-muted-foreground font-mono">{pr.part.referenceCode}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">
                            {pr.quantityFulfilled ?? 0}/{pr.quantityRequested}
                          </span>
                          <Badge
                            variant={
                              pr.status === 'FULFILLED'
                                ? 'success'
                                : pr.status === 'REJECTED'
                                ? 'destructive'
                                : pr.status === 'PARTIALLY_FULFILLED'
                                ? 'warning'
                                : 'secondary'
                            }
                            className="text-[10px] px-1.5 py-0"
                          >
                            {t(`supervisorWorkOrders.labels.partRequestStatus.${pr.status}`)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Status history ── */}
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('supervisorWorkOrders.detail.statusHistory')}</p>
              <p className="text-xs text-muted-foreground">
                {t('supervisorWorkOrders.detail.statusHistoryDescription')}
              </p>
              {detail.statusLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('supervisorWorkOrders.labels.noHistory')}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {detail.statusLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between rounded-md border px-3 py-2 text-xs gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {log.fromStatus && (
                            <>
                              <Badge
                                variant={getStatusBadgeVariant(log.fromStatus)}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {t(`supervisorWorkOrders.status.${log.fromStatus}`)}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge
                            variant={getStatusBadgeVariant(log.toStatus)}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {t(`supervisorWorkOrders.status.${log.toStatus}`)}
                          </Badge>
                        </div>
                        {log.label && (
                          <p className="text-muted-foreground">{log.label}</p>
                        )}
                      </div>
                      <div className="text-right text-muted-foreground shrink-0">
                        {log.actor && <p>{log.actor.name}</p>}
                        <p>{formatDateTime(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Actions ── */}
            {renderActionPanel()}
          </div>
        ) : null}

        <DialogFooter className="mt-2">
          {status === WorkOrderStatus.CLOSED && detail && (
            <Button
              type="button"
              variant="outline"
              disabled={isDownloadingReport}
              onClick={async () => {
                setIsDownloadingReport(true);
                try {
                  const { url } = await workOrdersApi.getReportUrl(detail.id);
                  window.open(url, '_blank', 'noopener,noreferrer');
                } catch {
                  toast.error(t('supervisorWorkOrders.toasts.reportDownloadError'));
                } finally {
                  setIsDownloadingReport(false);
                }
              }}
            >
              {isDownloadingReport
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Download className="mr-2 h-4 w-4" />}
              {t('supervisorWorkOrders.actions.downloadReport')}
            </Button>
          )}
          <Button type="button" onClick={() => handleOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
