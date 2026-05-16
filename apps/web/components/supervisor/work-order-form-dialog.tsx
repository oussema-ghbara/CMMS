'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { AlertCircle, Clock, Loader2, TriangleAlert, UserCheck } from 'lucide-react';
import { WorkOrderType, WorkOrderPriority } from '@gmao/shared';
import { workOrdersApi, type DuplicateWoConflict } from '@/lib/work-orders.api';
import { assetsApi } from '@/lib/assets.api';
import { usersApi } from '@/lib/users.api';
import { useAuthStore } from '@/store/auth.store';
import { Mono } from '@/components/ui/mono';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const inputS: React.CSSProperties = {
  display: 'block', width: '100%', height: 32, padding: '0 10px',
  border: '1px solid var(--sb-border)', borderRadius: 2, fontFamily: 'inherit',
  fontSize: 13, color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
  outline: 'none', boxSizing: 'border-box',
};

const selectS: React.CSSProperties = {
  display: 'block', width: '100%', height: 32, padding: '0 4px 0 10px',
  border: '1px solid var(--sb-border)', borderRadius: 2, fontFamily: 'inherit',
  fontSize: 13, color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
  cursor: 'pointer', outline: 'none', boxSizing: 'border-box',
};

const textareaS: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 10px',
  border: '1px solid var(--sb-border)', borderRadius: 2, fontFamily: 'inherit',
  fontSize: 13, color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
  outline: 'none', boxSizing: 'border-box', resize: 'vertical',
};

const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'var(--sb-p-crit)',
  [WorkOrderPriority.HIGH]:     'var(--sb-p-high)',
  [WorkOrderPriority.MEDIUM]:   'var(--sb-p-norm)',
  [WorkOrderPriority.LOW]:      'var(--sb-p-low)',
};

interface DuplicateConflictResponse {
  message: string;
  existingWorkOrder: DuplicateWoConflict;
}

function isDuplicateConflict(error: unknown): error is AxiosError<DuplicateConflictResponse> {
  const axiosError = error as AxiosError<DuplicateConflictResponse>;
  return (
    axiosError.response?.status === 409 &&
    axiosError.response?.data?.message === 'workOrders.duplicateActiveWo'
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function formatDays(days: number | null): string {
  if (days === null) return '—';
  return `${days}j`;
}

const workOrderSchema = z.object({
  type: z.nativeEnum(WorkOrderType),
  priority: z.nativeEnum(WorkOrderPriority),
  assetId: z.string().min(1),
  description: z.string().trim().min(1).max(2000),
  internalNotes: z.string().trim().max(2000).optional(),
  dueDate: z.string().optional(),
  estimatedDurationMinutes: z
    .string()
    .optional()
    .refine((v) => !v || (Number.isInteger(Number(v)) && Number(v) > 0), { message: 'invalid' }),
});

type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

interface WorkOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function getSubmitLabelKey(hasPrincipalTechnician: boolean): string {
  return hasPrincipalTechnician
    ? 'supervisorWorkOrders.form.createAndAssign'
    : 'supervisorWorkOrders.form.saveAsDraft';
}

const TYPE_OPTIONS = [WorkOrderType.CORRECTIVE, WorkOrderType.PREVENTIVE] as const;
const PRIORITY_OPTIONS = [
  WorkOrderPriority.CRITICAL,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.LOW,
] as const;

export function WorkOrderFormDialog({ open, onOpenChange }: WorkOrderFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [duplicateConflict, setDuplicateConflict] = useState<DuplicateWoConflict | null>(null);
  const [pendingValues, setPendingValues] = useState<WorkOrderFormValues | null>(null);
  const [principalTechnicianId, setPrincipalTechnicianId] = useState('');
  const [contributorIds, setContributorIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      type: WorkOrderType.CORRECTIVE,
      priority: WorkOrderPriority.MEDIUM,
      assetId: '',
      description: '',
      internalNotes: '',
      dueDate: '',
      estimatedDurationMinutes: '',
    },
  });

  const watchedAssetId = useWatch({ control, name: 'assetId' });
  const watchedType = useWatch({ control, name: 'type' });

  const hintsEnabled = open && isInitialized && !!watchedAssetId && !!watchedType;

  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ['supervisor', 'assets', 'all-for-select'],
    queryFn: () => assetsApi.list({ page: 1, limit: 100 }),
    enabled: open && isInitialized,
  });

  const { data: techniciansData, isLoading: techniciansLoading } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: () => usersApi.listTechnicians(),
    enabled: open && isInitialized,
  });

  const { data: techLoadData } = useQuery({
    queryKey: ['work-orders', 'technician-load'],
    queryFn: () => workOrdersApi.getTechnicianLoad(),
    enabled: open && isInitialized,
  });

  const { data: hintsData, isFetching: hintsFetching } = useQuery({
    queryKey: ['work-orders', 'duration-hints', watchedAssetId, watchedType, principalTechnicianId],
    queryFn: () =>
      workOrdersApi.getDurationHints({
        assetId: watchedAssetId,
        type: watchedType,
        technicianId: principalTechnicianId || undefined,
      }),
    enabled: hintsEnabled,
  });

  const doCreate = (values: WorkOrderFormValues, forceCreate: boolean) =>
    workOrdersApi.create({
      type: values.type,
      priority: values.priority,
      assetId: values.assetId,
      description: values.description,
      internalNotes: values.internalNotes || undefined,
      dueDate: values.dueDate || undefined,
      estimatedDurationMinutes: values.estimatedDurationMinutes
        ? Number(values.estimatedDurationMinutes)
        : undefined,
      forceCreate,
      principalTechnicianId: principalTechnicianId || undefined,
      contributorIds: contributorIds.length > 0 ? contributorIds : undefined,
    });

  const createMutation = useMutation({
    mutationFn: ({ values, force }: { values: WorkOrderFormValues; force: boolean }) =>
      doCreate(values, force),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'work-orders'] });
      toast.success(t('supervisorWorkOrders.toasts.createSuccess'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (isDuplicateConflict(error)) {
        setDuplicateConflict(error.response!.data.existingWorkOrder);
        return;
      }
      toast.error(getErrorMessage(error, t('supervisorWorkOrders.toasts.createError')));
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setDuplicateConflict(null);
      setPendingValues(null);
      setPrincipalTechnicianId('');
      setContributorIds([]);
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !createMutation.isPending) onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, createMutation.isPending, onOpenChange]);

  const onSubmit = (values: WorkOrderFormValues) => {
    setPendingValues(values);
    setDuplicateConflict(null);
    createMutation.mutate({ values, force: false });
  };

  const onForceCreate = () => {
    if (!pendingValues) return;
    setDuplicateConflict(null);
    createMutation.mutate({ values: pendingValues, force: true });
  };

  const onCancelForce = () => {
    setDuplicateConflict(null);
    setPendingValues(null);
  };

  const toggleContributor = (techId: string) => {
    setContributorIds((prev) =>
      prev.includes(techId) ? prev.filter((id) => id !== techId) : [...prev, techId],
    );
  };

  const principalLoad = techLoadData?.find((tl) => tl.technicianId === principalTechnicianId);
  const availableContributors = (techniciansData ?? []).filter((tech) => tech.id !== principalTechnicianId);
  const isPending = createMutation.isPending;

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onOpenChange(false); }}
    >
      <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 560, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
            {t('supervisorWorkOrders.form.createTitle')}
          </div>
          <button
            type="button"
            onClick={() => { if (!isPending) onOpenChange(false); }}
            disabled={isPending}
            style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
          </button>
        </div>

        {/* Duplicate conflict warning */}
        {duplicateConflict && (
          <div style={{ border: '1px solid var(--sb-p-high)', background: 'rgba(234,88,12,0.06)', borderRadius: 2, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <TriangleAlert style={{ width: 14, height: 14, color: 'var(--sb-p-high)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-p-high)', marginBottom: 3 }}>
                  {t('supervisorWorkOrders.duplicateWarning.title')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', lineHeight: 1.5 }}>
                  {t('supervisorWorkOrders.duplicateWarning.body', {
                    reference: duplicateConflict.referenceNumber,
                    status: t(`supervisorWorkOrders.status.${duplicateConflict.status}`),
                    type: t(`supervisorWorkOrders.types.${duplicateConflict.type}`),
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onCancelForce}
                disabled={isPending}
                style={{
                  background: 'transparent', border: '1px solid var(--sb-border-strong)',
                  borderRadius: 2, padding: '5px 12px',
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                  color: 'var(--sb-text-secondary)', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.5 : 1,
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={onForceCreate}
                disabled={isPending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: isPending ? 'var(--sb-border)' : 'var(--sb-p-high)',
                  color: isPending ? 'var(--sb-text-tertiary)' : '#fff',
                  border: 'none', borderRadius: 2, padding: '5px 12px',
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
                {t('supervisorWorkOrders.duplicateWarning.createAnyway')}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Type + Priority (2-col) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('supervisorWorkOrders.form.type')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
              </Mono>
              <select {...register('type')} style={selectS}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{t(`supervisorWorkOrders.types.${opt}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('supervisorWorkOrders.form.priority')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
              </Mono>
              <select {...register('priority')} style={selectS}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} style={{ color: PRIORITY_COLOR[opt] }}>
                    {t(`supervisorWorkOrders.priority.${opt}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Asset */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorWorkOrders.form.asset')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <select {...register('assetId')} disabled={assetsLoading}
              style={{ ...selectS, opacity: assetsLoading ? 0.6 : 1 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.assetId ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            >
              <option value="">{t('supervisorWorkOrders.form.assetPlaceholder')}</option>
              {assetsData?.data.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} — {asset.location.fullPath}
                </option>
              ))}
            </select>
            {errors.assetId && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('supervisorWorkOrders.validation.assetRequired')}</Mono>
            )}
          </div>

          {/* Duration hints */}
          {hintsEnabled && (
            <div style={{ border: '1px solid var(--sb-border)', background: 'var(--sb-surface)', borderRadius: 2, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Clock style={{ width: 12, height: 12, color: 'var(--sb-text-secondary)' }} />
                <Mono size={8} color="var(--sb-text-secondary)">{t('supervisorWorkOrders.form.durationHints.title')}</Mono>
                {hintsFetching && <Loader2 style={{ width: 10, height: 10, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: t('supervisorWorkOrders.form.durationHints.last5Asset'), value: formatDays(hintsData?.last5AssetAvgDays ?? null) },
                  { label: t('supervisorWorkOrders.form.durationHints.categoryAvg'), value: formatDays(hintsData?.categoryAvgDays ?? null) },
                  { label: t('supervisorWorkOrders.form.durationHints.techAvg'), value: principalTechnicianId ? formatDays(hintsData?.technicianAvgDays ?? null) : '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <Mono size={7} color="var(--sb-text-tertiary)" block style={{ marginBottom: 2 }}>{label}</Mono>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sb-text-primary)', fontFamily: MONO }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Principal Technician */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorWorkOrders.form.principalTechnician')}
            </Mono>
            <select
              value={principalTechnicianId}
              onChange={(e) => {
                setPrincipalTechnicianId(e.target.value);
                setContributorIds((prev) => prev.filter((id) => id !== e.target.value));
              }}
              disabled={techniciansLoading}
              style={{ ...selectS, opacity: techniciansLoading ? 0.6 : 1 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            >
              <option value="">{t('supervisorWorkOrders.form.technicianPlaceholder')}</option>
              {(techniciansData ?? []).map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>

          {/* Technician load */}
          {(principalLoad || principalTechnicianId) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
              <UserCheck style={{ width: 12, height: 12, color: 'var(--sb-text-tertiary)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--sb-text-secondary)' }}>
                {principalLoad
                  ? t('supervisorWorkOrders.form.techLoad', { count: principalLoad.openWoCount })
                  : t('supervisorWorkOrders.form.techNoLoad')}
              </span>
              {principalLoad?.hasCritical && (
                <span style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--sb-p-crit)', border: '1px solid var(--sb-p-crit)', borderRadius: 2, padding: '1px 5px' }}>
                  {t('supervisorWorkOrders.priority.CRITICAL')}
                </span>
              )}
            </div>
          )}

          {/* Draft/Assign hint */}
          <Mono size={8} color="var(--sb-text-tertiary)" block>
            {principalTechnicianId
              ? t('supervisorWorkOrders.form.assignedHint')
              : t('supervisorWorkOrders.form.draftHint')}
          </Mono>

          {/* Contributors */}
          {principalTechnicianId && availableContributors.length > 0 && (
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 6 }}>
                {t('supervisorWorkOrders.form.contributors')}
              </Mono>
              <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, padding: '6px 8px', maxHeight: 128, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {availableContributors.map((tech) => {
                  const load = techLoadData?.find((l) => l.technicianId === tech.id);
                  return (
                    <label
                      key={tech.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        style={{ width: 12, height: 12, flexShrink: 0, cursor: 'pointer' }}
                        checked={contributorIds.includes(tech.id)}
                        onChange={() => toggleContributor(tech.id)}
                      />
                      <span style={{ fontSize: 13, color: 'var(--sb-text-primary)', flex: 1 }}>{tech.name}</span>
                      {load && (
                        <span style={{ fontSize: 11, fontFamily: MONO, color: 'var(--sb-text-tertiary)' }}>
                          {load.openWoCount} OT
                          {load.hasCritical && <AlertCircle style={{ display: 'inline', width: 11, height: 11, color: 'var(--sb-p-crit)', marginLeft: 3 }} />}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorWorkOrders.form.description')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <textarea
              rows={3}
              maxLength={2000}
              placeholder={t('supervisorWorkOrders.form.descriptionPlaceholder')}
              {...register('description')}
              style={{ ...textareaS, borderColor: errors.description ? 'var(--sb-p-crit)' : 'var(--sb-border)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.description ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            />
            {errors.description && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('supervisorWorkOrders.validation.descriptionRequired')}</Mono>
            )}
          </div>

          {/* Internal Notes */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorWorkOrders.form.internalNotes')}
            </Mono>
            <textarea
              rows={2}
              maxLength={2000}
              placeholder={t('supervisorWorkOrders.form.internalNotesPlaceholder')}
              {...register('internalNotes')}
              style={textareaS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            />
          </div>

          {/* Due date + Duration (2-col) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('supervisorWorkOrders.form.dueDate')}
              </Mono>
              <input type="date" {...register('dueDate')} style={inputS}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              />
            </div>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('supervisorWorkOrders.form.estimatedDurationMinutes')}
              </Mono>
              <input type="number" min={1} step={1} {...register('estimatedDurationMinutes')}
                style={{ ...inputS, fontFamily: MONO, borderColor: errors.estimatedDurationMinutes ? 'var(--sb-p-crit)' : 'var(--sb-border)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = errors.estimatedDurationMinutes ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
              />
              {errors.estimatedDurationMinutes && (
                <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('supervisorWorkOrders.validation.estimatedDurationInvalid')}</Mono>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--sb-border)', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              style={{
                background: 'transparent', border: '1px solid var(--sb-border-strong)',
                borderRadius: 2, padding: '6px 16px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                color: 'var(--sb-text-secondary)', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.5 : 1,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !!duplicateConflict}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: isPending || duplicateConflict ? 'var(--sb-border)' : 'var(--sb-text-primary)',
                color: isPending || duplicateConflict ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
                border: 'none', borderRadius: 2, padding: '6px 16px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                cursor: isPending || duplicateConflict ? 'not-allowed' : 'pointer',
              }}
            >
              {isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
              {t(getSubmitLabelKey(!!principalTechnicianId))}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
