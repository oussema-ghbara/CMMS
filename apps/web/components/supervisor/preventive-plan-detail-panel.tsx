'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Download, FileText, GripVertical, Loader2,
  Paperclip, PauseCircle, Pencil, PlayCircle, Plus, Trash2, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mono } from '@/components/ui/mono';
import {
  preventivePlansApi,
  type PlanDocument,
  type PreventivePlanChecklistItem,
  type PreventivePlanItem,
} from '@/lib/preventive-plans.api';
import { PreventivePlanChecklistItemDialog, type ChecklistFormValues } from './preventive-plan-checklist-item-dialog';

const PLAN_DOC_TYPES = ['PROCEDURE_DOCUMENT', 'SAFETY_DATA_SHEET', 'SPECIFICATION_SHEET'] as const;
type PlanDocType = (typeof PLAN_DOC_TYPES)[number];
type PanelTab = 'detail' | 'checklist' | 'documents' | 'actions';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

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

function btnWideSecondaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    background: 'transparent',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    border: '1px solid var(--sb-border)',
    borderRadius: 2,
    padding: '7px 14px',
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function btnWideActionStyle(disabled = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: 'var(--sb-surface)',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-primary)',
    border: '1px solid var(--sb-border)',
    borderRadius: 2,
    padding: '10px 12px',
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textAlign: 'left',
  };
}

function btnWidePrimaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: disabled ? 'var(--sb-border)' : 'var(--sb-text-primary)',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
    border: 'none',
    borderRadius: 2,
    padding: '10px 12px',
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textAlign: 'left',
  };
}

function IconBtn({
  onClick, disabled, title, children,
}: {
  onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24,
        background: 'transparent', border: 'none', borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: 'var(--sb-text-secondary)',
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function IconBtnDestructive({
  onClick, disabled, children,
}: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24,
        background: 'transparent', border: 'none', borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: 'var(--sb-p-crit)',
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

interface PreventivePlanDetailPanelProps {
  plan: PreventivePlanItem;
  onClose: () => void;
  onEdit: (plan: PreventivePlanItem) => void;
}

export function PreventivePlanDetailPanel({ plan, onClose, onEdit }: PreventivePlanDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<PanelTab>('detail');
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PreventivePlanChecklistItem | null>(null);
  const [orderedItems, setOrderedItems] = useState<PreventivePlanChecklistItem[]>(plan.checklistItems ?? []);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [docType, setDocType] = useState<PlanDocType>('PROCEDURE_DOCUMENT');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [docFileError, setDocFileError] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrderedItems(plan.checklistItems ?? []);
  }, [plan.id, plan.checklistItems]);

  const documentsQuery = useQuery({
    queryKey: ['supervisor', 'preventive-plans', plan.id, 'documents'],
    queryFn: () => preventivePlansApi.listPlanDocuments(plan.id),
    enabled: activeTab === 'documents',
  });

  function invalidatePlans() {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
  }

  const activateMutation = useMutation({
    mutationFn: () => preventivePlansApi.activate(plan.id),
    onSuccess: () => { invalidatePlans(); toast.success(t('supervisorPreventivePlans.toasts.activateSuccess')); },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.activateError')),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => preventivePlansApi.deactivate(plan.id),
    onSuccess: () => { invalidatePlans(); toast.success(t('supervisorPreventivePlans.toasts.deactivateSuccess')); },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.deactivateError')),
  });

  const triggerMutation = useMutation({
    mutationFn: () => preventivePlansApi.triggerNow(plan.id),
    onSuccess: (data) => {
      invalidatePlans();
      toast.success(data.jobId
        ? t('supervisorPreventivePlans.toasts.triggerSuccessWithJob', { jobId: data.jobId })
        : t('supervisorPreventivePlans.toasts.triggerSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.triggerError')),
  });

  const addItemMutation = useMutation({
    mutationFn: (body: Parameters<typeof preventivePlansApi.addChecklistItem>[1]) =>
      preventivePlansApi.addChecklistItem(plan.id, body),
    onSuccess: () => {
      invalidatePlans();
      toast.success(t('supervisorPreventivePlans.toasts.itemCreateSuccess'));
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.itemCreateError')),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: Parameters<typeof preventivePlansApi.updateChecklistItem>[2] }) =>
      preventivePlansApi.updateChecklistItem(plan.id, itemId, body),
    onSuccess: () => {
      invalidatePlans();
      toast.success(t('supervisorPreventivePlans.toasts.itemUpdateSuccess'));
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.itemUpdateError')),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => preventivePlansApi.deleteChecklistItem(plan.id, itemId),
    onSuccess: () => { invalidatePlans(); toast.success(t('supervisorPreventivePlans.toasts.itemDeleteSuccess')); },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.itemDeleteError')),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      preventivePlansApi.reorderChecklistItems(plan.id, items),
    onSuccess: () => { invalidatePlans(); },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.reorderError')),
  });

  const uploadDocMutation = useMutation({
    mutationFn: () => {
      if (!selectedDocFile) throw new Error('no_file');
      return preventivePlansApi.uploadPlanDocument(plan.id, selectedDocFile, docType);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans', plan.id, 'documents'] });
      toast.success(t('supervisorPreventivePlans.documents.toasts.uploadSuccess'));
      setSelectedDocFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    },
    onError: () => toast.error(t('supervisorPreventivePlans.documents.toasts.uploadError')),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => preventivePlansApi.deletePlanDocument(plan.id, docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans', plan.id, 'documents'] });
      toast.success(t('supervisorPreventivePlans.documents.toasts.deleteSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.documents.toasts.deleteError')),
  });

  const handleDocDownload = async (doc: PlanDocument) => {
    setDownloadingDocId(doc.id);
    try {
      const url = await preventivePlansApi.getPlanDocumentDownloadUrl(plan.id, doc.id);
      window.open(url, '_blank');
    } catch {
      toast.error(t('supervisorPreventivePlans.documents.toasts.downloadError'));
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleDragStart = (itemId: string) => setDraggedItemId(itemId);

  const handleDrop = (targetId: string) => {
    if (!draggedItemId || draggedItemId === targetId) return;
    const next = [...orderedItems];
    const fromIndex = next.findIndex((item) => item.id === draggedItemId);
    const toIndex = next.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrderedItems(next);
    reorderMutation.mutate(next.map((item, i) => ({ id: item.id, sortOrder: i })));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const next = [...orderedItems];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved);
    setOrderedItems(next);
    reorderMutation.mutate(next.map((entry, i) => ({ id: entry.id, sortOrder: i })));
  };

  const submitChecklistItem = (values: ChecklistFormValues) => {
    const body = {
      description: values.description,
      taskType: values.taskType,
      expectedCondition: values.expectedCondition || undefined,
      isMandatory: values.isMandatory,
      autoCreateCorrectiveWO: values.autoCreateCorrectiveWO,
      sortOrder: editingItem?.sortOrder ?? orderedItems.length,
    };
    if (editingItem) {
      updateItemMutation.mutate({ itemId: editingItem.id, body });
    } else {
      addItemMutation.mutate(body);
    }
  };

  const handleDeleteItem = (item: PreventivePlanChecklistItem) => {
    if (!window.confirm(t('supervisorPreventivePlans.checklist.deleteConfirm'))) return;
    deleteItemMutation.mutate(item.id);
  };

  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'detail', label: 'DÉTAIL' },
    { id: 'checklist', label: `CHECKLIST (${orderedItems.length})` },
    { id: 'documents', label: 'DOCUMENTS' },
    { id: 'actions', label: 'ACTIONS' },
  ];

  const isMutating =
    activateMutation.isPending ||
    deactivateMutation.isPending ||
    triggerMutation.isPending;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        <div style={{
          background: 'var(--sb-surface)',
          padding: '12px 16px 10px',
          borderBottom: '1px solid var(--sb-border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--sb-text-primary)',
                letterSpacing: '-0.01em',
                marginBottom: plan.asset?.name ? 2 : 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {plan.title}
              </div>
              {plan.asset?.name && (
                <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {plan.asset.name}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} style={{
              background: 'transparent',
              border: '1px solid var(--sb-border)',
              padding: '2px 7px',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: 8,
            }}>
              <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 2,
              background: plan.isActive ? 'var(--sb-s-done-bg)' : 'var(--sb-hover)',
              border: `1px solid ${plan.isActive ? 'rgba(46,122,78,0.3)' : 'var(--sb-border)'}`,
              fontFamily: MONO, fontSize: 9, fontWeight: 600,
              color: plan.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)',
              textTransform: 'uppercase' as const, letterSpacing: '0.08em', flexShrink: 0,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: plan.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)' }} />
              {plan.isActive ? t('common.active') : t('common.inactive')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--sb-border)', background: 'var(--sb-surface)', flexShrink: 0 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: -1,
                borderBottom: isActive ? '2px solid var(--sb-text-primary)' : '2px solid transparent',
              }}>
                <Mono size={9} color={isActive ? 'var(--sb-text-primary)' : 'var(--sb-text-secondary)'}
                  tracking="0.12em" weight={isActive ? 600 : 500}>
                  {tab.label}
                </Mono>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {activeTab === 'detail' && (
            <div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sb-border)', marginBottom: 16 }}>
                <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>
                    {t('supervisorPreventivePlans.detail.asset')}
                  </Mono>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', display: 'block' }}>
                    {plan.asset.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--sb-text-secondary)', display: 'block', marginTop: 2 }}>
                    {plan.asset.location?.fullPath ?? '—'}
                  </span>
                </div>
                <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>
                    {t('supervisorPreventivePlans.detail.status')}
                  </Mono>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', display: 'block' }}>
                    {plan.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--sb-text-secondary)', display: 'block', marginTop: 2 }}>
                    {t('supervisorPreventivePlans.detail.checklistCount', { count: orderedItems.length })}
                  </span>
                </div>
                <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>
                    {t('supervisorPreventivePlans.detail.frequency')}
                  </Mono>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', display: 'block' }}>
                    {t(`supervisorPreventivePlans.frequencyType.${plan.frequencyType}`)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--sb-text-secondary)', display: 'block', marginTop: 2 }}>
                    {plan.frequencyType === 'FIXED_INTERVAL_DAYS'
                      ? t('supervisorPreventivePlans.detail.intervalDaysValue', { count: plan.intervalDays ?? 0 })
                      : plan.calendarExpression ?? '—'}
                  </span>
                </div>
                <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>
                    {t('supervisorPreventivePlans.detail.nextDueAt')}
                  </Mono>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', fontFamily: MONO, display: 'block' }}>
                    {formatDateTime(plan.nextDueAt)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--sb-text-secondary)', display: 'block', marginTop: 2 }}>
                    {t('supervisorPreventivePlans.detail.estimatedDuration', { count: plan.estimatedDurationMinutes ?? 0 })}
                  </span>
                </div>
                <div style={{ background: 'var(--sb-bg)', padding: '9px 12px', gridColumn: 'span 2' }}>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>
                    {t('supervisorPreventivePlans.columns.defaultTechnician')}
                  </Mono>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', display: 'block' }}>
                    {plan.defaultTechnician?.name ?? t('supervisorPreventivePlans.labels.unassigned')}
                  </span>
                </div>
              </div>

              {plan.description && (
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 6 }}>
                    {t('supervisorPreventivePlans.detail.descriptionLabel')}
                  </Mono>
                  <p style={{ fontSize: 13, color: 'var(--sb-text-secondary)', lineHeight: 1.7, margin: 0, borderLeft: '2px solid var(--sb-border)', paddingLeft: 10, whiteSpace: 'pre-wrap' }}>
                    {plan.description}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checklist' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {orderedItems.length === 0 ? (
                <div style={{ border: '1px dashed var(--sb-border)', padding: '28px 0', textAlign: 'center' }}>
                  <Mono size={11} color="var(--sb-text-tertiary)">{t('supervisorPreventivePlans.checklist.empty')}</Mono>
                </div>
              ) : orderedItems.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(item.id)}
                  style={{
                    border: `1px solid ${draggedItemId === item.id ? 'var(--sb-text-primary)' : 'var(--sb-border)'}`,
                    background: 'var(--sb-surface)',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <GripVertical size={14} style={{ color: 'var(--sb-text-tertiary)', marginTop: 2, cursor: 'grab', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                        <Mono size={9} color="var(--sb-text-tertiary)">#{index + 1}</Mono>
                        <span style={{
                          display: 'inline-block', padding: '1px 5px',
                          border: '1px solid var(--sb-border)', borderRadius: 2,
                          fontFamily: MONO, fontSize: 9, fontWeight: 600,
                          color: 'var(--sb-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em',
                        }}>
                          {t(`supervisorPreventivePlans.taskType.${item.taskType}`)}
                        </span>
                        {item.isMandatory && (
                          <span style={{
                            display: 'inline-block', padding: '1px 5px',
                            border: '1px solid rgba(196,152,32,0.4)', borderRadius: 2,
                            fontFamily: MONO, fontSize: 9, fontWeight: 600,
                            color: 'var(--sb-accent)', textTransform: 'uppercase', letterSpacing: '0.08em',
                          }}>
                            {t('supervisorPreventivePlans.checklist.mandatory')}
                          </span>
                        )}
                        {item.autoCreateCorrectiveWO && (
                          <span style={{
                            display: 'inline-block', padding: '1px 5px',
                            border: '1px solid rgba(46,122,78,0.3)', borderRadius: 2,
                            fontFamily: MONO, fontSize: 9, fontWeight: 600,
                            color: 'var(--sb-s-done)', textTransform: 'uppercase', letterSpacing: '0.08em',
                          }}>
                            {t('supervisorPreventivePlans.checklist.autoCreateCorrectiveWO')}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', margin: 0 }}>
                        {item.description}
                      </p>
                      {item.expectedCondition && (
                        <p style={{ fontSize: 11, color: 'var(--sb-text-secondary)', margin: '3px 0 0', lineHeight: 1.5 }}>
                          {t('supervisorPreventivePlans.checklist.expectedCondition', { value: item.expectedCondition })}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                      <IconBtn onClick={() => { setEditingItem(item); setItemDialogOpen(true); }} title="Modifier">
                        <Pencil size={13} />
                      </IconBtn>
                      <IconBtnDestructive onClick={() => handleDeleteItem(item)} disabled={deleteItemMutation.isPending}>
                        <Trash2 size={13} />
                      </IconBtnDestructive>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <IconBtn onClick={() => moveItem(index, -1)} disabled={index === 0}>
                          <ArrowUp size={12} />
                        </IconBtn>
                        <IconBtn onClick={() => moveItem(index, 1)} disabled={index === orderedItems.length - 1}>
                          <ArrowDown size={12} />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                style={btnWideSecondaryStyle(addItemMutation.isPending || updateItemMutation.isPending)}
                disabled={addItemMutation.isPending || updateItemMutation.isPending}
                onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}
              >
                <Plus size={13} />
                {t('supervisorPreventivePlans.checklist.addAction')}
              </button>
            </div>
          )}

          {activeTab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {documentsQuery.isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
                  <Loader2 size={18} style={{ color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (documentsQuery.data ?? []).length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', margin: 0 }}>
                  {t('supervisorPreventivePlans.documents.empty')}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(documentsQuery.data ?? []).map((doc: PlanDocument) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        border: '1px solid var(--sb-border)', padding: '8px 10px',
                      }}
                    >
                      <FileText size={14} style={{ color: 'var(--sb-text-tertiary)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.fileName}
                        </p>
                        <Mono size={9} color="var(--sb-text-tertiary)">
                          {t(`supervisorPreventivePlans.documents.documentType.${doc.documentType}`)} — {formatFileSize(doc.fileSize)} — v{doc.version}
                        </Mono>
                      </div>
                      <IconBtn
                        onClick={() => { void handleDocDownload(doc); }}
                        disabled={downloadingDocId === doc.id}
                      >
                        {downloadingDocId === doc.id
                          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          : <Download size={13} />}
                      </IconBtn>
                      <IconBtnDestructive
                        onClick={() => deleteDocMutation.mutate(doc.id)}
                        disabled={deleteDocMutation.isPending}
                      >
                        <Trash2 size={13} />
                      </IconBtnDestructive>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ border: '1px solid var(--sb-border)', padding: '10px 12px' }}>
                <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 10 }}>
                  {t('supervisorPreventivePlans.documents.uploadTitle')}
                </Mono>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selectedDocFile) { setDocFileError(true); return; }
                    uploadDocMutation.mutate();
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                      {t('supervisorPreventivePlans.documents.form.type')}
                    </Mono>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as PlanDocType)}
                      style={selectS}
                    >
                      {PLAN_DOC_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`supervisorPreventivePlans.documents.documentType.${type}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                      {t('supervisorPreventivePlans.documents.form.file')}
                    </Mono>
                    {selectedDocFile ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        border: '1px solid var(--sb-border)', padding: '4px 10px', height: 28,
                      }}>
                        <Paperclip size={12} style={{ color: 'var(--sb-text-tertiary)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedDocFile.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedDocFile(null); if (docFileInputRef.current) docFileInputRef.current.value = ''; }}
                          style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sb-text-tertiary)', padding: 0, flexShrink: 0 }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => docFileInputRef.current?.click()}
                        style={btnWideSecondaryStyle()}
                      >
                        <Paperclip size={13} />
                        {t('supervisorPreventivePlans.documents.form.chooseFile')}
                      </button>
                    )}
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0] ?? null; setSelectedDocFile(f); if (f) setDocFileError(false); }}
                    />
                    {docFileError && (
                      <Mono size={9} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>
                        {t('supervisorPreventivePlans.documents.validation.fileRequired')}
                      </Mono>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={uploadDocMutation.isPending}
                    style={btnPrimaryStyle(uploadDocMutation.isPending)}
                  >
                    {uploadDocMutation.isPending && (
                      <Loader2 size={11} style={{ marginRight: 5, animation: 'spin 1s linear infinite' }} />
                    )}
                    {t('supervisorPreventivePlans.documents.form.upload')}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                style={btnWideActionStyle()}
                onClick={() => onEdit(plan)}
              >
                <Pencil size={14} />
                {t('supervisorPreventivePlans.actions.editPlan')}
              </button>

              {plan.isActive ? (
                <button
                  type="button"
                  style={btnWideActionStyle(deactivateMutation.isPending)}
                  disabled={deactivateMutation.isPending}
                  onClick={() => deactivateMutation.mutate()}
                >
                  {deactivateMutation.isPending
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <PauseCircle size={14} />}
                  {t('supervisorPreventivePlans.actions.deactivate')}
                </button>
              ) : (
                <button
                  type="button"
                  style={btnWideActionStyle(activateMutation.isPending)}
                  disabled={activateMutation.isPending}
                  onClick={() => activateMutation.mutate()}
                >
                  {activateMutation.isPending
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <PlayCircle size={14} />}
                  {t('supervisorPreventivePlans.actions.activate')}
                </button>
              )}

              <button
                type="button"
                style={btnWidePrimaryStyle(triggerMutation.isPending || !plan.isActive || isMutating)}
                disabled={triggerMutation.isPending || !plan.isActive || isMutating}
                onClick={() => triggerMutation.mutate()}
              >
                {triggerMutation.isPending
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <PlayCircle size={14} />}
                {t('supervisorPreventivePlans.actions.triggerNow')}
              </button>
            </div>
          )}
        </div>
      </div>

      <PreventivePlanChecklistItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        onSubmit={submitChecklistItem}
      />
    </>
  );
}
