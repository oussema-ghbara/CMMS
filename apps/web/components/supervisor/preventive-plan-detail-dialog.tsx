'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, FileText, GripVertical, Loader2, Paperclip, PauseCircle, Pencil, PlayCircle, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  preventivePlansApi,
  type PlanDocument,
  type PreventivePlanChecklistItem,
  type PreventivePlanItem,
} from '@/lib/preventive-plans.api';
import { cn } from '@/lib/utils';
import { PreventivePlanChecklistItemDialog, type ChecklistFormValues } from './preventive-plan-checklist-item-dialog';

const PLAN_DOC_TYPES = ['PROCEDURE_DOCUMENT', 'SAFETY_DATA_SHEET', 'SPECIFICATION_SHEET'] as const;
type PlanDocType = (typeof PLAN_DOC_TYPES)[number];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface PreventivePlanDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PreventivePlanItem | null;
  onEditPlan: (plan: PreventivePlanItem) => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}


export function PreventivePlanDetailDialog({ open, onOpenChange, plan, onEditPlan }: PreventivePlanDetailDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PreventivePlanChecklistItem | null>(null);
  const [orderedItems, setOrderedItems] = useState<PreventivePlanChecklistItem[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // Documents state
  const [docType, setDocType] = useState<PlanDocType>('PROCEDURE_DOCUMENT');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [docFileError, setDocFileError] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const documentsQuery = useQuery({
    queryKey: ['supervisor', 'preventive-plans', plan?.id, 'documents'],
    queryFn: () => preventivePlansApi.listPlanDocuments(plan!.id),
    enabled: open && !!plan,
  });

  useEffect(() => {
    setOrderedItems(plan?.checklistItems ?? []);
  }, [plan]);

  const activateMutation = useMutation({
    mutationFn: (planId: string) => preventivePlansApi.activate(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.activateSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.activateError')),
  });

  const deactivateMutation = useMutation({
    mutationFn: (planId: string) => preventivePlansApi.deactivate(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.deactivateSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.deactivateError')),
  });

  const triggerMutation = useMutation({
    mutationFn: (planId: string) => preventivePlansApi.triggerNow(planId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(
        data.jobId
          ? t('supervisorPreventivePlans.toasts.triggerSuccessWithJob', { jobId: data.jobId })
          : t('supervisorPreventivePlans.toasts.triggerSuccess'),
      );
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.triggerError')),
  });

  const addItemMutation = useMutation({
    mutationFn: (payload: { planId: string; body: Parameters<typeof preventivePlansApi.addChecklistItem>[1] }) =>
      preventivePlansApi.addChecklistItem(payload.planId, payload.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.itemCreateSuccess'));
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.itemCreateError')),
  });

  const updateItemMutation = useMutation({
    mutationFn: (payload: {
      planId: string;
      itemId: string;
      body: Parameters<typeof preventivePlansApi.updateChecklistItem>[2];
    }) => preventivePlansApi.updateChecklistItem(payload.planId, payload.itemId, payload.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.itemUpdateSuccess'));
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.itemUpdateError')),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (payload: { planId: string; itemId: string }) =>
      preventivePlansApi.deleteChecklistItem(payload.planId, payload.itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.itemDeleteSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.itemDeleteError')),
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: { planId: string; items: { id: string; sortOrder: number }[] }) =>
      preventivePlansApi.reorderChecklistItems(payload.planId, payload.items),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.reorderError')),
  });

  const uploadDocMutation = useMutation({
    mutationFn: () => {
      if (!selectedDocFile || !plan) throw new Error('no_file');
      return preventivePlansApi.uploadPlanDocument(plan.id, selectedDocFile, docType);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['supervisor', 'preventive-plans', plan?.id, 'documents'],
      });
      toast.success(t('supervisorPreventivePlans.documents.toasts.uploadSuccess'));
      setSelectedDocFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    },
    onError: () => toast.error(t('supervisorPreventivePlans.documents.toasts.uploadError')),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => preventivePlansApi.deletePlanDocument(plan!.id, docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['supervisor', 'preventive-plans', plan?.id, 'documents'],
      });
      toast.success(t('supervisorPreventivePlans.documents.toasts.deleteSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.documents.toasts.deleteError')),
  });

  const handleDocDownload = async (doc: PlanDocument) => {
    if (!plan) return;
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

  const handleDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocFile) {
      setDocFileError(true);
      return;
    }
    uploadDocMutation.mutate();
  };

  const closeDetail = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setEditingItem(null);
      setItemDialogOpen(false);
      setDraggedItemId(null);
    }
  };

  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId);
  };

  const handleDrop = (targetId: string) => {
    if (!plan || !draggedItemId || draggedItemId === targetId) return;

    const current = [...orderedItems];
    const fromIndex = current.findIndex((item) => item.id === draggedItemId);
    const toIndex = current.findIndex((item) => item.id === targetId);

    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setOrderedItems(current);
    reorderMutation.mutate({
      planId: plan.id,
      items: current.map((item, index) => ({ id: item.id, sortOrder: index })),
    });
  };

  const submitChecklistItem = (values: ChecklistFormValues) => {
    if (!plan) return;

    const body = {
      description: values.description,
      taskType: values.taskType,
      expectedCondition: values.expectedCondition || undefined,
      isMandatory: values.isMandatory,
      autoCreateCorrectiveWO: values.autoCreateCorrectiveWO,
      sortOrder: editingItem?.sortOrder ?? orderedItems.length,
    };

    if (editingItem) {
      updateItemMutation.mutate({ planId: plan.id, itemId: editingItem.id, body });
      return;
    }

    addItemMutation.mutate({ planId: plan.id, body });
  };

  const handleDeleteItem = (item: PreventivePlanChecklistItem) => {
    if (!plan) return;
    if (!window.confirm(t('supervisorPreventivePlans.checklist.deleteConfirm'))) return;
    deleteItemMutation.mutate({ planId: plan.id, itemId: item.id });
  };

  return (
    <Dialog open={open} onOpenChange={closeDetail}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('supervisorPreventivePlans.detail.title')}</DialogTitle>
          <DialogDescription>{t('supervisorPreventivePlans.detail.description')}</DialogDescription>
        </DialogHeader>

        {!plan ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {t('supervisorPreventivePlans.states.detailEmpty')}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorPreventivePlans.detail.asset')}</p>
                <p className="mt-1 font-medium">{plan.asset.name}</p>
                <p className="text-sm text-muted-foreground">{plan.asset.qrCodeIdentifier}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorPreventivePlans.detail.frequency')}</p>
                <p className="mt-1 font-medium">{t(`supervisorPreventivePlans.frequencyType.${plan.frequencyType}`)}</p>
                <p className="text-sm text-muted-foreground">
                  {plan.frequencyType === 'FIXED_INTERVAL_DAYS'
                    ? t('supervisorPreventivePlans.detail.intervalDaysValue', { count: plan.intervalDays ?? 0 })
                    : plan.calendarExpression ?? '—'}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorPreventivePlans.detail.nextDueAt')}</p>
                <p className="mt-1 font-medium">{formatDateTime(plan.nextDueAt)}</p>
                <p className="text-sm text-muted-foreground">
                  {t('supervisorPreventivePlans.detail.estimatedDuration', { count: plan.estimatedDurationMinutes ?? 0 })}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorPreventivePlans.detail.status')}</p>
                <Badge variant={plan.isActive ? 'success' : 'destructive'} className="mt-2">
                  {plan.isActive ? t('common.active') : t('common.inactive')}
                </Badge>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('supervisorPreventivePlans.detail.checklistCount', { count: plan.checklistItems.length })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('supervisorPreventivePlans.detail.descriptionLabel')}</p>
              <p className="text-sm text-muted-foreground">{plan.description ?? t('common.noData')}</p>
            </div>

            <Separator />

            {/* ── Documents ── */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold">{t('supervisorPreventivePlans.documents.title')}</h3>

              {documentsQuery.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (documentsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('supervisorPreventivePlans.documents.empty')}
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {(documentsQuery.data ?? []).map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`supervisorPreventivePlans.documents.documentType.${doc.documentType}`)} —{' '}
                          {formatFileSize(doc.fileSize)} — v{doc.version} —{' '}
                          {doc.uploadedBy?.name ?? '—'}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        v{doc.version}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDocDownload(doc)}
                        disabled={downloadingDocId === doc.id}
                        title={t('supervisorPreventivePlans.documents.actions.download')}
                      >
                        {downloadingDocId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteDocMutation.mutate(doc.id)}
                        disabled={deleteDocMutation.isPending}
                        title={t('supervisorPreventivePlans.documents.actions.delete')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Upload form */}
              <form onSubmit={handleDocSubmit} className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">{t('supervisorPreventivePlans.documents.uploadTitle')}</p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1.5 flex-1 min-w-[180px]">
                    <Label htmlFor="plan-doc-type">{t('supervisorPreventivePlans.documents.form.type')}</Label>
                    <select
                      id="plan-doc-type"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as PlanDocType)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      {PLAN_DOC_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`supervisorPreventivePlans.documents.documentType.${type}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[160px]">
                    <Label>{t('supervisorPreventivePlans.documents.form.file')}</Label>
                    {selectedDocFile ? (
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm h-9">
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 text-xs">{selectedDocFile.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDocFile(null);
                            if (docFileInputRef.current) docFileInputRef.current.value = '';
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full"
                        onClick={() => docFileInputRef.current?.click()}
                      >
                        <Paperclip className="mr-1.5 h-4 w-4" />
                        {t('supervisorPreventivePlans.documents.form.chooseFile')}
                      </Button>
                    )}
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setSelectedDocFile(f);
                        if (f) setDocFileError(false);
                      }}
                    />
                    {docFileError && (
                      <p className="text-xs text-destructive">
                        {t('supervisorPreventivePlans.documents.validation.fileRequired')}
                      </p>
                    )}
                  </div>
                  <Button type="submit" size="sm" disabled={uploadDocMutation.isPending} className="h-9">
                    {uploadDocMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('supervisorPreventivePlans.documents.form.upload')}
                  </Button>
                </div>
              </form>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{t('supervisorPreventivePlans.checklist.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('supervisorPreventivePlans.checklist.subtitle')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => onEditPlan(plan)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('supervisorPreventivePlans.actions.editPlan')}
                </Button>
                {plan.isActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => deactivateMutation.mutate(plan.id)}
                    disabled={deactivateMutation.isPending}
                  >
                    <PauseCircle className="mr-2 h-4 w-4" />
                    {t('supervisorPreventivePlans.actions.deactivate')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => activateMutation.mutate(plan.id)}
                    disabled={activateMutation.isPending}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {t('supervisorPreventivePlans.actions.activate')}
                  </Button>
                )}
                <Button type="button" onClick={() => triggerMutation.mutate(plan.id)} disabled={triggerMutation.isPending || !plan.isActive}>
                  {triggerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                  {t('supervisorPreventivePlans.actions.triggerNow')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {orderedItems.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t('supervisorPreventivePlans.checklist.empty')}
                </div>
              ) : (
                orderedItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(item.id)}
                    className={cn('flex items-start gap-3 rounded-lg border bg-card p-4 transition-shadow', draggedItemId === item.id && 'ring-2 ring-primary')}
                  >
                    <button
                      type="button"
                      className="mt-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label={t('supervisorPreventivePlans.checklist.dragHandle')}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">#{index + 1}</Badge>
                        <Badge variant="outline">{t(`supervisorPreventivePlans.taskType.${item.taskType}`)}</Badge>
                        {item.isMandatory && <Badge variant="warning">{t('supervisorPreventivePlans.checklist.mandatory')}</Badge>}
                        {item.autoCreateCorrectiveWO && (
                          <Badge variant="success">{t('supervisorPreventivePlans.checklist.autoCreateCorrectiveWO')}</Badge>
                        )}
                      </div>
                      <p className="font-medium">{item.description}</p>
                      <div className="text-sm text-muted-foreground">
                        {item.expectedCondition
                          ? t('supervisorPreventivePlans.checklist.expectedCondition', { value: item.expectedCondition })
                          : t('supervisorPreventivePlans.checklist.noExpectedCondition')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('common.edit')}
                        onClick={() => {
                          setEditingItem(item);
                          setItemDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('common.delete')}
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteItem(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t('supervisorPreventivePlans.checklist.moveUp')}
                          disabled={index === 0}
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...orderedItems];
                            const [moved] = next.splice(index, 1);
                            next.splice(index - 1, 0, moved);
                            setOrderedItems(next);
                            reorderMutation.mutate({
                              planId: plan.id,
                              items: next.map((entry, nextIndex) => ({ id: entry.id, sortOrder: nextIndex })),
                            });
                          }}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t('supervisorPreventivePlans.checklist.moveDown')}
                          disabled={index === orderedItems.length - 1}
                          onClick={() => {
                            if (index === orderedItems.length - 1) return;
                            const next = [...orderedItems];
                            const [moved] = next.splice(index, 1);
                            next.splice(index + 1, 0, moved);
                            setOrderedItems(next);
                            reorderMutation.mutate({
                              planId: plan.id,
                              items: next.map((entry, nextIndex) => ({ id: entry.id, sortOrder: nextIndex })),
                            });
                          }}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeDetail(false)}>
                {t('common.close')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setItemDialogOpen(true);
                }}
                disabled={addItemMutation.isPending || updateItemMutation.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('supervisorPreventivePlans.checklist.addAction')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {plan && (
          <PreventivePlanChecklistItemDialog
            open={itemDialogOpen}
            onOpenChange={setItemDialogOpen}
            item={editingItem}
            onSubmit={submitChecklistItem}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}