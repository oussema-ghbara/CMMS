'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { X, Loader2, Plus, Trash2, Search, Package } from 'lucide-react';
import {
  WorkOrderStatus,
  WorkOrderPriority,
  InterventionResult,
  InterventionActionType,
  ChecklistItemStatus,
  OnHoldReasonType,
  PartRequestStatus,
} from '@gmao/shared';
import {
  workOrdersApi,
  type WorkOrderDetail,
  type WorkOrderChecklistItem,
  type SubmitClosurePayload,
  type PutOnHoldPayload,
  type ResumeHoldPayload,
  type CompleteChecklistItemPayload,
  type InterventionActionPayload,
  type SubmitPartRequestPayload,
} from '@/lib/work-orders.api';
import { inventoryApi, type PartCatalogItem } from '@/lib/inventory.api';
import { useAuthStore } from '@/store/auth.store';
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
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(value));
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'Critique',
  [WorkOrderPriority.HIGH]:     'Haute',
  [WorkOrderPriority.MEDIUM]:   'Normale',
  [WorkOrderPriority.LOW]:      'Basse',
};

const INTERVENTION_RESULT_LABEL: Record<InterventionResult, string> = {
  [InterventionResult.RESOLVED]:             'Résolu',
  [InterventionResult.PARTIALLY_RESOLVED]:   'Partiellement résolu',
  [InterventionResult.NEEDS_FOLLOW_UP]:      'Suivi requis',
  [InterventionResult.COULD_NOT_INTERVENE]:  'Intervention impossible',
};

const ACTION_TYPE_LABEL: Record<InterventionActionType, string> = {
  [InterventionActionType.INSPECTION]:  'Inspection',
  [InterventionActionType.REPAIR]:      'Réparation',
  [InterventionActionType.REPLACEMENT]: 'Remplacement',
  [InterventionActionType.CALIBRATION]: 'Calibration',
  [InterventionActionType.LUBRICATION]: 'Lubrification',
  [InterventionActionType.CLEANING]:    'Nettoyage',
};

const ON_HOLD_REASON_LABEL: Record<OnHoldReasonType, string> = {
  [OnHoldReasonType.MISSING_PART]:        'Pièce manquante',
  [OnHoldReasonType.EXTERNAL_CONTRACTOR]: 'Prestataire externe',
  [OnHoldReasonType.ACCESS_DENIED]:       'Accès refusé',
  [OnHoldReasonType.OTHER]:               'Autre',
};

const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  [ChecklistItemStatus.PENDING]:           'En attente',
  [ChecklistItemStatus.DONE]:              'Terminé',
  [ChecklistItemStatus.ANOMALY_DETECTED]:  'Anomalie',
  [ChecklistItemStatus.NOT_APPLICABLE]:    'N/A',
};

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
  resize: 'vertical',
  minHeight: 60,
  boxSizing: 'border-box',
};

const actionBoxStyle: React.CSSProperties = {
  border: '1px solid var(--sb-border)',
  padding: '12px 14px',
  background: 'var(--sb-surface)',
  marginBottom: 8,
};

function btnPrimary(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: disabled ? 'var(--sb-border)' : 'var(--sb-text-primary)',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
    border: 'none', borderRadius: 2, padding: '6px 14px',
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
    textTransform: 'uppercase', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function btnSecondary(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'transparent',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    border: '1px solid var(--sb-border)', borderRadius: 2, padding: '6px 14px',
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
    textTransform: 'uppercase', fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function btnDestructive(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: disabled ? 'var(--sb-border)' : 'var(--sb-p-crit)',
    color: disabled ? 'var(--sb-text-tertiary)' : '#fff',
    border: 'none', borderRadius: 2, padding: '6px 14px',
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
    textTransform: 'uppercase', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <Mono size={9} tracking="0.13em" color="var(--sb-text-tertiary)">{children}</Mono>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
      <Mono size={9} color="var(--sb-text-tertiary)" style={{ flexShrink: 0 }}>{label}</Mono>
      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const CHECKLIST_DOT_COLOR: Record<string, string> = {
  [ChecklistItemStatus.PENDING]:          'var(--sb-text-tertiary)',
  [ChecklistItemStatus.DONE]:             'var(--sb-s-done)',
  [ChecklistItemStatus.ANOMALY_DETECTED]: 'var(--sb-p-crit)',
  [ChecklistItemStatus.NOT_APPLICABLE]:   'var(--sb-text-tertiary)',
};

interface ChecklistItemRowProps {
  item: WorkOrderChecklistItem;
  canComplete: boolean;
  isPrincipal: boolean;
  woId: string;
  onUpdated: () => void;
}

function ChecklistItemRow({ item, canComplete, isPrincipal, woId, onUpdated }: ChecklistItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [newStatus, setNewStatus] = useState<ChecklistItemStatus>(ChecklistItemStatus.DONE);
  const [anomalyDesc, setAnomalyDesc] = useState('');
  const [naReason, setNaReason] = useState('');
  const queryClient = useQueryClient();

  const completeMut = useMutation({
    mutationFn: (payload: CompleteChecklistItemPayload) =>
      workOrdersApi.completeChecklistItem(woId, item.id, payload),
    onSuccess: () => {
      toast.success('Tâche mise à jour.');
      setExpanded(false);
      onUpdated();
      void queryClient.invalidateQueries({ queryKey: ['technician', 'work-order', woId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Impossible de mettre à jour la tâche.')),
  });

  const handleSubmit = () => {
    const payload: CompleteChecklistItemPayload = { status: newStatus };
    if (newStatus === ChecklistItemStatus.ANOMALY_DETECTED) payload.anomalyDescription = anomalyDesc;
    if (newStatus === ChecklistItemStatus.NOT_APPLICABLE) payload.notApplicableReason = naReason;
    completeMut.mutate(payload);
  };

  const isDone = item.status !== ChecklistItemStatus.PENDING;
  const dotColor = CHECKLIST_DOT_COLOR[item.status] ?? 'var(--sb-text-tertiary)';

  return (
    <div style={{ borderBottom: '1px solid var(--sb-border)', padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: dotColor,
          flexShrink: 0, marginTop: 4,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--sb-text-primary)', marginBottom: 2 }}>
            {item.description}
            {item.isMandatory && (
              <span style={{ color: 'var(--sb-p-crit)', marginLeft: 4, fontSize: 10 }}>*</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mono size={9} color="var(--sb-text-tertiary)">{item.taskType}</Mono>
            <Mono size={9} color={dotColor}>{CHECKLIST_STATUS_LABEL[item.status] ?? item.status}</Mono>
          </div>
          {item.anomalyDescription && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--sb-p-crit)' }}>
              Anomalie : {item.anomalyDescription}
            </div>
          )}
          {item.notApplicableReason && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--sb-text-tertiary)' }}>
              N/A : {item.notApplicableReason}
            </div>
          )}
        </div>
        {canComplete && isPrincipal && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.10em',
              textTransform: 'uppercase', color: 'var(--sb-text-tertiary)',
              flexShrink: 0, padding: '2px 0',
            }}
          >
            {expanded ? 'Annuler' : isDone ? 'Modifier' : 'Compléter'}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 16 }}>
          <div style={{ marginBottom: 6 }}>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as ChecklistItemStatus)}
              style={{ ...selectS, width: 'auto' }}
            >
              <option value={ChecklistItemStatus.DONE}>Terminé</option>
              <option value={ChecklistItemStatus.ANOMALY_DETECTED}>Anomalie détectée</option>
              {!item.isMandatory && (
                <option value={ChecklistItemStatus.NOT_APPLICABLE}>Non applicable</option>
              )}
            </select>
          </div>
          {newStatus === ChecklistItemStatus.ANOMALY_DETECTED && (
            <div style={{ marginBottom: 6 }}>
              <textarea
                value={anomalyDesc}
                onChange={(e) => setAnomalyDesc(e.target.value)}
                placeholder="Description de l'anomalie..."
                style={textareaS}
              />
            </div>
          )}
          {newStatus === ChecklistItemStatus.NOT_APPLICABLE && (
            <div style={{ marginBottom: 6 }}>
              <textarea
                value={naReason}
                onChange={(e) => setNaReason(e.target.value)}
                placeholder="Raison de non-applicabilité..."
                style={textareaS}
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={completeMut.isPending}
            style={btnPrimary(completeMut.isPending)}
          >
            {completeMut.isPending ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

interface TechnicianWorkOrderDetailPanelProps {
  workOrderId: string;
  onClose: () => void;
}

type ActiveAction = 'start' | 'hold' | 'resume' | 'closure' | null;

export function TechnicianWorkOrderDetailPanel({ workOrderId, onClose }: TechnicianWorkOrderDetailPanelProps) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [activeTab, setActiveTab] = useState<'detail' | 'pieces' | 'history'>('detail');

  const [closureResult, setClosureResult] = useState<InterventionResult>(InterventionResult.RESOLVED);
  const [closureExplanation, setClosureExplanation] = useState('');
  const [closureActions, setClosureActions] = useState<InterventionActionPayload[]>([]);

  const [holdReason, setHoldReason] = useState<OnHoldReasonType>(OnHoldReasonType.MISSING_PART);
  const [holdDetail, setHoldDetail] = useState('');
  const [holdDate, setHoldDate] = useState('');

  const [contractorCost, setContractorCost] = useState('');

  const [prMode, setPrMode] = useState<'catalog' | 'offcatalog'>('catalog');
  const [partSearch, setPartSearch] = useState('');
  const [selectedPart, setSelectedPart] = useState<PartCatalogItem | null>(null);
  const [prShowDropdown, setPrShowDropdown] = useState(false);
  const [prQuantity, setPrQuantity] = useState('1');
  const [prNote, setPrNote] = useState('');
  const [prOffCatalog, setPrOffCatalog] = useState('');
  const partSearchRef = useRef<HTMLDivElement>(null);

  const { data: wo, isLoading, isError } = useQuery({
    queryKey: ['technician', 'work-order', workOrderId],
    queryFn: () => workOrdersApi.getById(workOrderId),
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['technician', 'work-order', workOrderId] });
    void queryClient.invalidateQueries({ queryKey: ['technician', 'work-orders'] });
  };

  const startMut = useMutation({
    mutationFn: () => workOrdersApi.start(workOrderId),
    onSuccess: () => { toast.success('Intervention démarrée.'); setActiveAction(null); invalidateAll(); },
    onError: (err) => toast.error(getErrorMessage(err, 'Impossible de démarrer l\'intervention.')),
  });

  const holdMut = useMutation({
    mutationFn: (payload: PutOnHoldPayload) => workOrdersApi.putOnHold(workOrderId, payload),
    onSuccess: () => { toast.success('Bon de travail mis en attente.'); setActiveAction(null); invalidateAll(); },
    onError: (err) => toast.error(getErrorMessage(err, 'Impossible de mettre en attente.')),
  });

  const resumeMut = useMutation({
    mutationFn: (payload: ResumeHoldPayload) => workOrdersApi.resume(workOrderId, payload),
    onSuccess: () => { toast.success('Intervention reprise.'); setActiveAction(null); invalidateAll(); },
    onError: (err) => toast.error(getErrorMessage(err, 'Impossible de reprendre l\'intervention.')),
  });

  const closureMut = useMutation({
    mutationFn: (payload: SubmitClosurePayload) => workOrdersApi.submitClosure(workOrderId, payload),
    onSuccess: () => { toast.success('Clôture soumise pour validation.'); setActiveAction(null); invalidateAll(); },
    onError: (err) => toast.error(getErrorMessage(err, 'Impossible de soumettre la clôture.')),
  });

  const submitPartRequestMut = useMutation({
    mutationFn: (payload: SubmitPartRequestPayload) => workOrdersApi.submitPartRequest(workOrderId, payload),
    onSuccess: ({ stockWarning }) => {
      toast.success('Demande de pièce envoyée.');
      if (stockWarning) toast.warning(`Attention : ${stockWarning}`);
      setSelectedPart(null);
      setPartSearch('');
      setPrQuantity('1');
      setPrNote('');
      setPrOffCatalog('');
      invalidateAll();
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Impossible de soumettre la demande.')),
  });

  const { data: partsData } = useQuery({
    queryKey: ['parts-search', partSearch],
    queryFn: () => inventoryApi.getParts({ search: partSearch, isActive: true, limit: 20 }),
    enabled: prMode === 'catalog' && prShowDropdown,
  });

  useEffect(() => {
    if (!prShowDropdown) return;
    const handler = (e: MouseEvent) => {
      if (partSearchRef.current && !partSearchRef.current.contains(e.target as Node)) {
        setPrShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [prShowDropdown]);

  const isPrincipal = wo
    ? wo.assignments.some((a) => a.isPrincipal && a.isActive && a.technicianId === user?.id)
    : false;

  const currentHold = wo?.onHoldPeriods.find((p) => !p.resumedAt) ?? null;
  const isExternalContractorHold = currentHold?.reasonType === OnHoldReasonType.EXTERNAL_CONTRACTOR;

  const isActiveAssignee = wo
    ? wo.assignments.some((a) => a.isActive && a.technicianId === user?.id)
    : false;

  const canStart    = !!wo && wo.status === WorkOrderStatus.ASSIGNED && isPrincipal;
  const canHold     = !!wo && wo.status === WorkOrderStatus.IN_PROGRESS && isPrincipal;
  const canResume   = !!wo && wo.status === WorkOrderStatus.ON_HOLD && isPrincipal;
  const canClosure  = !!wo && wo.status === WorkOrderStatus.IN_PROGRESS && isPrincipal;
  const canChecklist = !!wo && wo.status === WorkOrderStatus.IN_PROGRESS;
  const canRequestPart = !!wo
    && wo.status !== WorkOrderStatus.CLOSED
    && wo.status !== WorkOrderStatus.CANCELLED
    && isActiveAssignee;

  const handleHoldSubmit = () => {
    const payload: PutOnHoldPayload = { reasonType: holdReason };
    if (holdDetail.trim()) payload.detail = holdDetail.trim();
    if (holdDate) payload.expectedResolutionDate = holdDate;
    holdMut.mutate(payload);
  };

  const handleResumeSubmit = () => {
    const payload: ResumeHoldPayload = {};
    if (isExternalContractorHold && contractorCost.trim()) {
      payload.contractorCost = parseFloat(contractorCost);
    }
    resumeMut.mutate(payload);
  };

  const handleClosureSubmit = () => {
    const payload: SubmitClosurePayload = { result: closureResult };
    if (closureExplanation.trim()) payload.resultExplanation = closureExplanation.trim();
    if (closureActions.length > 0) payload.actions = closureActions;
    closureMut.mutate(payload);
  };

  const addClosureAction = () => {
    setClosureActions((prev) => [...prev, { actionType: InterventionActionType.INSPECTION }]);
  };

  const removeClosureAction = (idx: number) => {
    setClosureActions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateClosureAction = (idx: number, patch: Partial<InterventionActionPayload>) => {
    setClosureActions((prev) => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <div
        style={{
          height: 44, borderBottom: '1px solid var(--sb-border)',
          display: 'flex', alignItems: 'center', padding: '0 14px',
          background: 'var(--sb-surface)', flexShrink: 0, gap: 8,
        }}
      >
        {wo ? (
          <Mono size={10} color="var(--sb-text-primary)" weight={600} tracking="0.06em">
            {wo.referenceNumber}
          </Mono>
        ) : (
          <Mono size={10} color="var(--sb-text-tertiary)">Chargement...</Mono>
        )}
        <div style={{ flex: 1 }} />
        {wo && <StatusPill status={wo.status} />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sb-text-tertiary)', padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div
        style={{
          height: 36, borderBottom: '1px solid var(--sb-border)',
          display: 'flex', alignItems: 'stretch', background: 'var(--sb-surface)',
          flexShrink: 0,
        }}
      >
        {([
          { key: 'detail', label: 'Détail' },
          { key: 'pieces', label: `Pièces${wo && wo.partRequests.length > 0 ? ` (${wo.partRequests.length})` : ''}` },
          { key: 'history', label: 'Historique' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
              textTransform: 'uppercase', fontWeight: activeTab === key ? 700 : 500,
              color: activeTab === key ? 'var(--sb-text-primary)' : 'var(--sb-text-tertiary)',
              padding: '0 14px',
              borderBottom: activeTab === key ? '2px solid var(--sb-text-primary)' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      { }
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--sb-text-tertiary)' }} />
          </div>
        )}
        {isError && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <Mono color="var(--sb-p-crit)">Erreur lors du chargement.</Mono>
          </div>
        )}

        {wo && activeTab === 'detail' && (
          <>
            { }
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Bon de travail</SectionLabel>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', marginBottom: 8 }}>
                {wo.description}
              </div>
              <FieldRow label="Équipement" value={wo.asset.name} />
              <FieldRow label="Emplacement" value={wo.asset.location.fullPath} />
              <FieldRow label="Priorité" value={<PriorityChip priority={wo.priority} />} />
              <FieldRow label="Type" value={wo.type === 'CORRECTIVE' ? 'Correctif' : 'Préventif'} />
              {wo.estimatedDurationMinutes && (
                <FieldRow label="Durée estimée" value={formatDuration(wo.estimatedDurationMinutes)} />
              )}
              {wo.dueDate && (
                <FieldRow label="Échéance" value={formatDate(wo.dueDate)} />
              )}
            </div>

            { }
            {(canStart || canHold || canResume || canClosure) && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Actions</SectionLabel>

                { }
                {canStart && (
                  <div style={actionBoxStyle}>
                    <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--sb-text-secondary)' }}>
                      Démarrez l'intervention pour ce bon de travail.
                    </div>
                    <button
                      type="button"
                      onClick={() => startMut.mutate()}
                      disabled={startMut.isPending}
                      style={btnPrimary(startMut.isPending)}
                    >
                      {startMut.isPending
                        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                        : null}
                      Démarrer l'intervention
                    </button>
                  </div>
                )}

                { }
                {canHold && (
                  <div style={actionBoxStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeAction === 'hold' ? 10 : 0 }}>
                      <Mono size={9} tracking="0.10em">Mettre en attente</Mono>
                      <button
                        type="button"
                        onClick={() => setActiveAction(activeAction === 'hold' ? null : 'hold')}
                        style={btnSecondary()}
                      >
                        {activeAction === 'hold' ? 'Annuler' : 'Mettre en attente'}
                      </button>
                    </div>
                    {activeAction === 'hold' && (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          <SectionLabel>Raison</SectionLabel>
                          <select value={holdReason} onChange={(e) => setHoldReason(e.target.value as OnHoldReasonType)} style={selectS}>
                            {Object.values(OnHoldReasonType).map((r) => (
                              <option key={r} value={r}>{ON_HOLD_REASON_LABEL[r]}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <SectionLabel>Détail (optionnel)</SectionLabel>
                          <textarea
                            value={holdDetail}
                            onChange={(e) => setHoldDetail(e.target.value)}
                            placeholder="Précisions..."
                            style={textareaS}
                          />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <SectionLabel>Date de résolution prévue (optionnel)</SectionLabel>
                          <input
                            type="date"
                            value={holdDate}
                            onChange={(e) => setHoldDate(e.target.value)}
                            style={inputS}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleHoldSubmit}
                          disabled={holdMut.isPending}
                          style={btnDestructive(holdMut.isPending)}
                        >
                          {holdMut.isPending ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                          Confirmer
                        </button>
                      </>
                    )}
                  </div>
                )}

                { }
                {canResume && (
                  <div style={actionBoxStyle}>
                    {currentHold && (
                      <div style={{ marginBottom: 8 }}>
                        <FieldRow label="Raison de l'attente" value={ON_HOLD_REASON_LABEL[currentHold.reasonType as OnHoldReasonType] ?? currentHold.reasonType} />
                        {currentHold.detail && <FieldRow label="Détail" value={currentHold.detail} />}
                        {currentHold.expectedResolutionDate && (
                          <FieldRow label="Résolution prévue" value={formatDate(currentHold.expectedResolutionDate)} />
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeAction === 'resume' ? 10 : 0 }}>
                      <Mono size={9} tracking="0.10em">Reprendre l'intervention</Mono>
                      <button
                        type="button"
                        onClick={() => setActiveAction(activeAction === 'resume' ? null : 'resume')}
                        style={btnPrimary()}
                      >
                        {activeAction === 'resume' ? 'Annuler' : 'Reprendre'}
                      </button>
                    </div>
                    {activeAction === 'resume' && (
                      <>
                        {isExternalContractorHold && (
                          <div style={{ marginBottom: 10 }}>
                            <SectionLabel>Coût prestataire (optionnel)</SectionLabel>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={contractorCost}
                              onChange={(e) => setContractorCost(e.target.value)}
                              placeholder="0.00"
                              style={inputS}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleResumeSubmit}
                          disabled={resumeMut.isPending}
                          style={btnPrimary(resumeMut.isPending)}
                        >
                          {resumeMut.isPending ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                          Confirmer la reprise
                        </button>
                      </>
                    )}
                  </div>
                )}

                { }
                {canClosure && (
                  <div style={actionBoxStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeAction === 'closure' ? 10 : 0 }}>
                      <Mono size={9} tracking="0.10em">Soumettre la clôture</Mono>
                      <button
                        type="button"
                        onClick={() => setActiveAction(activeAction === 'closure' ? null : 'closure')}
                        style={btnPrimary()}
                      >
                        {activeAction === 'closure' ? 'Annuler' : 'Soumettre'}
                      </button>
                    </div>
                    {activeAction === 'closure' && (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          <SectionLabel>Résultat de l'intervention</SectionLabel>
                          <select
                            value={closureResult}
                            onChange={(e) => setClosureResult(e.target.value as InterventionResult)}
                            style={selectS}
                          >
                            {Object.values(InterventionResult).map((r) => (
                              <option key={r} value={r}>{INTERVENTION_RESULT_LABEL[r]}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <SectionLabel>Explication (optionnel)</SectionLabel>
                          <textarea
                            value={closureExplanation}
                            onChange={(e) => setClosureExplanation(e.target.value)}
                            placeholder="Détails du résultat..."
                            style={textareaS}
                          />
                        </div>

                        { }
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <SectionLabel>Actions réalisées (optionnel)</SectionLabel>
                            <button
                              type="button"
                              onClick={addClosureAction}
                              style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: 'var(--sb-text-secondary)', display: 'flex', alignItems: 'center', gap: 2,
                                fontFamily: MONO, fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase',
                              }}
                            >
                              <Plus size={10} /> Ajouter
                            </button>
                          </div>
                          {closureActions.map((action, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                              <select
                                value={action.actionType}
                                onChange={(e) => updateClosureAction(idx, { actionType: e.target.value as InterventionActionType })}
                                style={{ ...selectS, flex: '0 0 140px' }}
                              >
                                {Object.values(InterventionActionType).map((t) => (
                                  <option key={t} value={t}>{ACTION_TYPE_LABEL[t]}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={action.detail ?? ''}
                                onChange={(e) => updateClosureAction(idx, { detail: e.target.value })}
                                placeholder="Détail (optionnel)"
                                style={{ ...inputS, flex: 1 }}
                              />
                              <button
                                type="button"
                                onClick={() => removeClosureAction(idx)}
                                style={{
                                  background: 'transparent', border: 'none', cursor: 'pointer',
                                  color: 'var(--sb-text-tertiary)', display: 'flex', alignItems: 'center',
                                  padding: '4px 0', flexShrink: 0,
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleClosureSubmit}
                          disabled={closureMut.isPending}
                          style={btnPrimary(closureMut.isPending)}
                        >
                          {closureMut.isPending ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                          Confirmer la clôture
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            { }
            {wo.checklistItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>
                  Liste de vérification ({wo.checklistItems.filter((i) => i.status === ChecklistItemStatus.DONE).length}/{wo.checklistItems.length})
                </SectionLabel>
                {wo.checklistItems
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      canComplete={canChecklist}
                      isPrincipal={isPrincipal}
                      woId={workOrderId}
                      onUpdated={invalidateAll}
                    />
                  ))}
              </div>
            )}

            { }
            {wo.assignments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Assignations</SectionLabel>
                {wo.assignments.filter((a) => a.isActive).map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--sb-text-primary)' }}>{a.technician.name}</span>
                    <Mono size={9} color="var(--sb-text-tertiary)">
                      {a.isPrincipal ? 'Principal' : 'Contributeur'}
                    </Mono>
                  </div>
                ))}
              </div>
            )}

            { }
            {wo.internalNotes && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Notes internes</SectionLabel>
                <div style={{
                  fontSize: 12, color: 'var(--sb-text-secondary)',
                  background: 'var(--sb-surface)', border: '1px solid var(--sb-border)',
                  borderRadius: 2, padding: '8px 10px', lineHeight: 1.5,
                }}>
                  {wo.internalNotes}
                </div>
              </div>
            )}

            { }
            {wo.status === WorkOrderStatus.PENDING_VALIDATION || wo.status === WorkOrderStatus.CLOSED ? (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Résumé des coûts</SectionLabel>
                <FieldRow label="Main d'œuvre" value={`${wo.costSummary.laborCost.toFixed(2)} €`} />
                <FieldRow label="Pièces" value={`${wo.costSummary.partsCost.toFixed(2)} €`} />
                <FieldRow label="Prestataire" value={`${wo.costSummary.contractorCost.toFixed(2)} €`} />
                <FieldRow label="Total" value={<strong>{wo.costSummary.totalCost.toFixed(2)} €</strong>} />
              </div>
            ) : null}
          </>
        )}

        {wo && activeTab === 'pieces' && (
          <>

            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Demandes en cours</SectionLabel>
              {wo.partRequests.length === 0 ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '24px 0', gap: 8,
                  border: '1px dashed var(--sb-border)', borderRadius: 2,
                }}>
                  <Package size={20} color="var(--sb-text-tertiary)" />
                  <Mono size={9} color="var(--sb-text-tertiary)">Aucune demande pour ce BT</Mono>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {wo.partRequests.map((pr) => {
                    const statusMeta: Record<string, { color: string; label: string }> = {
                      [PartRequestStatus.PENDING]:             { color: 'var(--sb-s-wait)',   label: 'En attente' },
                      [PartRequestStatus.FULFILLED]:           { color: 'var(--sb-s-done)',   label: 'Servie' },
                      [PartRequestStatus.PARTIALLY_FULFILLED]: { color: 'var(--sb-s-active)', label: 'Partielle' },
                      [PartRequestStatus.REJECTED]:            { color: 'var(--sb-p-crit)',   label: 'Rejetée' },
                      CANCELLED:                               { color: 'var(--sb-text-tertiary)', label: 'Annulée' },
                    };
                    const meta = statusMeta[pr.status] ?? { color: 'var(--sb-text-tertiary)', label: pr.status };
                    return (
                      <div
                        key={pr.id}
                        style={{
                          border: '1px solid var(--sb-border)', borderRadius: 2,
                          padding: '10px 12px', background: 'var(--sb-surface)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)', marginBottom: 2 }}>
                              {pr.part?.name ?? pr.offCatalogDescription ?? '—'}
                            </div>
                            {pr.part && (
                              <Mono size={9} color="var(--sb-text-tertiary)">{pr.part.referenceCode}</Mono>
                            )}
                            {pr.note && (
                              <div style={{ fontSize: 11, color: 'var(--sb-text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                                {pr.note}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: `${meta.color}18`, border: `1px solid ${meta.color}30`,
                              borderRadius: 2, padding: '2px 7px',
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                              <Mono size={9} color={meta.color}>{meta.label}</Mono>
                            </span>
                            <Mono size={9} color="var(--sb-text-tertiary)">
                              {pr.quantityFulfilled != null
                                ? `${pr.quantityFulfilled} / ${pr.quantityRequested} unité(s)`
                                : `${pr.quantityRequested} unité(s) demandée(s)`}
                            </Mono>
                          </div>
                        </div>
                        {pr.rejectionReason && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--sb-p-crit)' }}>
                            Rejet : {pr.rejectionReason}{pr.rejectionDetail ? ` — ${pr.rejectionDetail}` : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {canRequestPart && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Nouvelle demande</SectionLabel>
                <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, padding: '12px 14px', background: 'var(--sb-surface)' }}>

                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    {(['catalog', 'offcatalog'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setPrMode(mode); setSelectedPart(null); setPartSearch(''); setPrOffCatalog(''); }}
                        style={{
                          flex: 1, height: 26, border: `1px solid ${prMode === mode ? 'var(--sb-border-strong)' : 'var(--sb-border)'}`,
                          borderRadius: 2, background: prMode === mode ? 'var(--sb-text-primary)' : 'transparent',
                          color: prMode === mode ? 'var(--sb-bg)' : 'var(--sb-text-secondary)',
                          fontFamily: MONO, fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase',
                          fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {mode === 'catalog' ? 'Catalogue' : 'Hors catalogue'}
                      </button>
                    ))}
                  </div>

                  {prMode === 'catalog' && (
                    <div style={{ marginBottom: 10 }} ref={partSearchRef}>
                      <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 4 }}>
                        Pièce
                      </Mono>
                      {selectedPart ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          border: '1px solid var(--sb-border)', borderRadius: 2,
                          padding: '6px 10px', background: 'var(--sb-bg)',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)' }}>{selectedPart.name}</div>
                            <Mono size={9} color="var(--sb-text-tertiary)">{selectedPart.referenceCode} · Stock: {selectedPart.currentStock}</Mono>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedPart(null); setPartSearch(''); }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sb-text-tertiary)', padding: 2 }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <div style={{ position: 'relative' }}>
                            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--sb-text-tertiary)', pointerEvents: 'none' }} />
                            <input
                              value={partSearch}
                              onChange={(e) => { setPartSearch(e.target.value); setPrShowDropdown(true); }}
                              onFocus={() => setPrShowDropdown(true)}
                              placeholder="Rechercher une pièce..."
                              style={{ ...inputS, paddingLeft: 26 }}
                            />
                          </div>
                          {prShowDropdown && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                              border: '1px solid var(--sb-border)', borderRadius: 2,
                              background: 'var(--sb-bg)', maxHeight: 200, overflowY: 'auto',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                            }}>
                              {!partsData || partsData.data.length === 0 ? (
                                <div style={{ padding: '10px 12px' }}>
                                  <Mono size={9} color="var(--sb-text-tertiary)">Aucune pièce trouvée</Mono>
                                </div>
                              ) : (
                                partsData.data.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={() => { setSelectedPart(p); setPartSearch(p.name); setPrShowDropdown(false); }}
                                    style={{
                                      display: 'block', width: '100%', textAlign: 'left',
                                      padding: '8px 12px', background: 'transparent', border: 'none',
                                      borderBottom: '1px solid var(--sb-border)', cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--sb-hover)'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                                  >
                                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)' }}>{p.name}</div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                      <Mono size={9} color="var(--sb-text-tertiary)">{p.referenceCode}</Mono>
                                      <Mono size={9} color={p.currentStock === 0 ? 'var(--sb-p-crit)' : 'var(--sb-text-tertiary)'}>
                                        Stock: {p.currentStock}
                                      </Mono>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {prMode === 'offcatalog' && (
                    <div style={{ marginBottom: 10 }}>
                      <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 4 }}>
                        Description de la pièce
                      </Mono>
                      <textarea
                        value={prOffCatalog}
                        onChange={(e) => setPrOffCatalog(e.target.value)}
                        placeholder="Décrivez la pièce nécessaire..."
                        maxLength={500}
                        style={{ ...textareaS, minHeight: 52 }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: 10 }}>
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 4 }}>
                      Quantité
                    </Mono>
                    <input
                      type="number"
                      min={1}
                      value={prQuantity}
                      onChange={(e) => setPrQuantity(e.target.value)}
                      style={{ ...inputS, width: 90 }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ display: 'block', marginBottom: 4 }}>
                      Note pour le magasinier (optionnel)
                    </Mono>
                    <textarea
                      value={prNote}
                      onChange={(e) => setPrNote(e.target.value)}
                      placeholder="Instructions particulières..."
                      maxLength={500}
                      style={{ ...textareaS, minHeight: 44 }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={submitPartRequestMut.isPending || (prMode === 'catalog' && !selectedPart) || (prMode === 'offcatalog' && !prOffCatalog.trim())}
                    onClick={() => {
                      const qty = parseInt(prQuantity, 10);
                      if (Number.isNaN(qty) || qty < 1) { toast.error('Quantité invalide.'); return; }
                      const payload: SubmitPartRequestPayload = { quantityRequested: qty };
                      if (prMode === 'catalog' && selectedPart) payload.partId = selectedPart.id;
                      if (prMode === 'offcatalog' && prOffCatalog.trim()) payload.offCatalogDescription = prOffCatalog.trim();
                      if (prNote.trim()) payload.note = prNote.trim();
                      submitPartRequestMut.mutate(payload);
                    }}
                    style={btnPrimary(submitPartRequestMut.isPending || (prMode === 'catalog' && !selectedPart) || (prMode === 'offcatalog' && !prOffCatalog.trim()))}
                  >
                    {submitPartRequestMut.isPending ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                    Envoyer la demande
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {wo && activeTab === 'history' && (
          <>

            {wo.interventionLogs.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Interventions</SectionLabel>
                {wo.interventionLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      borderBottom: '1px solid var(--sb-border)', paddingBottom: 10, marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)' }}>
                        {log.technician.name}
                      </span>
                      <Mono size={9} color="var(--sb-text-tertiary)">
                        {formatDuration(log.activeDurationMinutes)}
                      </Mono>
                    </div>
                    <FieldRow label="Début" value={formatDateTime(log.startedAt)} />
                    {log.endedAt && <FieldRow label="Fin" value={formatDateTime(log.endedAt)} />}
                    {log.result && (
                      <FieldRow
                        label="Résultat"
                        value={INTERVENTION_RESULT_LABEL[log.result as InterventionResult] ?? log.result}
                      />
                    )}
                    {log.resultExplanation && (
                      <div style={{ fontSize: 11, color: 'var(--sb-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                        {log.resultExplanation}
                      </div>
                    )}
                    {log.actions.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {log.actions.map((a) => (
                          <div key={a.id} style={{ fontSize: 11, color: 'var(--sb-text-secondary)' }}>
                            • {ACTION_TYPE_LABEL[a.actionType as InterventionActionType] ?? a.actionType}
                            {a.description ? ` — ${a.description}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {wo.onHoldPeriods.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Périodes d'attente</SectionLabel>
                {wo.onHoldPeriods.map((p) => (
                  <div key={p.id} style={{ borderBottom: '1px solid var(--sb-border)', paddingBottom: 8, marginBottom: 8 }}>
                    <FieldRow
                      label="Raison"
                      value={ON_HOLD_REASON_LABEL[p.reasonType as OnHoldReasonType] ?? p.reasonType}
                    />
                    {p.detail && <FieldRow label="Détail" value={p.detail} />}
                    <FieldRow label="Début" value={formatDateTime(p.startedAt)} />
                    <FieldRow label="Reprise" value={formatDateTime(p.resumedAt)} />
                    {p.supervisorResolutionNote && (
                      <FieldRow label="Note superviseur" value={p.supervisorResolutionNote} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {wo.validationActions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Validations</SectionLabel>
                {wo.validationActions.map((v) => (
                  <div key={v.id} style={{ borderBottom: '1px solid var(--sb-border)', paddingBottom: 8, marginBottom: 8 }}>
                    <FieldRow
                      label="Action"
                      value={v.action === 'VALIDATED' ? 'Validé' : v.action === 'REJECTED' ? 'Rejeté' : v.action}
                    />
                    <FieldRow label="Date" value={formatDateTime(v.createdAt)} />
                    {v.rejectionReason && (
                      <FieldRow label="Raison du rejet" value={v.rejectionReason} />
                    )}
                    {v.rejectionDetail && (
                      <div style={{ fontSize: 11, color: 'var(--sb-text-secondary)', marginTop: 2 }}>
                        {v.rejectionDetail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Historique des statuts</SectionLabel>
              {wo.statusLogs.map((log) => (
                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <Mono size={9} color="var(--sb-text-tertiary)" style={{ flexShrink: 0 }}>
                    {formatDateTime(log.createdAt)}
                  </Mono>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--sb-text-secondary)' }}>
                    {log.actor?.name ?? '—'}
                  </span>
                  <StatusPill status={log.toStatus} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
