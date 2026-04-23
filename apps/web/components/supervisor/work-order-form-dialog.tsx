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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth.store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

const textareaClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none';

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
    .refine((v) => !v || (Number.isInteger(Number(v)) && Number(v) > 0), {
      message: 'invalid',
    }),
});

type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

interface WorkOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const principalLoad = techLoadData?.find((t) => t.technicianId === principalTechnicianId);

  const availableContributors = (techniciansData ?? []).filter(
    (tech) => tech.id !== principalTechnicianId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('supervisorWorkOrders.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('supervisorWorkOrders.form.createDescription')}</DialogDescription>
        </DialogHeader>

        {/* Duplicate WO warning panel */}
        {duplicateConflict && (
          <div
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <div className="flex items-start gap-2">
              <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {t('supervisorWorkOrders.duplicateWarning.title')}
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {t('supervisorWorkOrders.duplicateWarning.body', {
                    reference: duplicateConflict.referenceNumber,
                    status: t(`supervisorWorkOrders.status.${duplicateConflict.status}`),
                    type: t(`supervisorWorkOrders.types.${duplicateConflict.type}`),
                  })}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancelForce}
                disabled={createMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onForceCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t('supervisorWorkOrders.duplicateWarning.createAnyway')}
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-type">{t('supervisorWorkOrders.form.type')}</Label>
            <select id="wo-type" className={selectClass} {...register('type')}>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`supervisorWorkOrders.types.${opt}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-priority">{t('supervisorWorkOrders.form.priority')}</Label>
            <select id="wo-priority" className={selectClass} {...register('priority')}>
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`supervisorWorkOrders.priority.${opt}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Asset */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-asset">{t('supervisorWorkOrders.form.asset')}</Label>
            <select
              id="wo-asset"
              className={selectClass}
              {...register('assetId')}
              disabled={assetsLoading}
            >
              <option value="">{t('supervisorWorkOrders.form.assetPlaceholder')}</option>
              {assetsData?.data.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} — {asset.location.fullPath}
                </option>
              ))}
            </select>
            {errors.assetId && (
              <p className="text-xs text-destructive">
                {t('supervisorWorkOrders.validation.assetRequired')}
              </p>
            )}
          </div>

          {/* Duration hints panel — shown once asset + type are selected */}
          {hintsEnabled && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {t('supervisorWorkOrders.form.durationHints.title')}
                </p>
                {hintsFetching && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">
                    {t('supervisorWorkOrders.form.durationHints.last5Asset')}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatDays(hintsData?.last5AssetAvgDays ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('supervisorWorkOrders.form.durationHints.categoryAvg')}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatDays(hintsData?.categoryAvgDays ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('supervisorWorkOrders.form.durationHints.techAvg')}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {principalTechnicianId
                      ? formatDays(hintsData?.technicianAvgDays ?? null)
                      : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Principal technician */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-principal">
              {t('supervisorWorkOrders.form.principalTechnician')}
              <span className="ml-1 text-muted-foreground text-xs">
                ({t('common.optional')})
              </span>
            </Label>
            <select
              id="wo-principal"
              className={selectClass}
              value={principalTechnicianId}
              onChange={(e) => {
                setPrincipalTechnicianId(e.target.value);
                setContributorIds((prev) => prev.filter((id) => id !== e.target.value));
              }}
              disabled={techniciansLoading}
            >
              <option value="">{t('supervisorWorkOrders.form.technicianPlaceholder')}</option>
              {(techniciansData ?? []).map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name}
                </option>
              ))}
            </select>

            {/* Technician load indicator */}
            {principalLoad && (
              <div className="flex items-center gap-2 px-1">
                <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {t('supervisorWorkOrders.form.techLoad', {
                    count: principalLoad.openWoCount,
                  })}
                </span>
                {principalLoad.hasCritical && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1">
                    {t('supervisorWorkOrders.priority.CRITICAL')}
                  </Badge>
                )}
              </div>
            )}
            {principalTechnicianId && !principalLoad && (
              <p className="text-xs text-muted-foreground px-1 flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" />
                {t('supervisorWorkOrders.form.techNoLoad')}
              </p>
            )}
          </div>

          {/* Contributors — only shown if principal is selected */}
          {principalTechnicianId && availableContributors.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t('supervisorWorkOrders.form.contributors')}
                <span className="ml-1 text-muted-foreground text-xs">
                  ({t('common.optional')})
                </span>
              </Label>
              <div className="rounded-md border border-input p-2 space-y-1 max-h-32 overflow-y-auto">
                {availableContributors.map((tech) => {
                  const load = techLoadData?.find((l) => l.technicianId === tech.id);
                  return (
                    <label
                      key={tech.id}
                      className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={contributorIds.includes(tech.id)}
                        onChange={() => toggleContributor(tech.id)}
                      />
                      <span className="text-sm flex-1">{tech.name}</span>
                      {load && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {load.openWoCount} OT
                          {load.hasCritical && (
                            <AlertCircle className="inline h-3 w-3 text-destructive ml-0.5" />
                          )}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-description">{t('supervisorWorkOrders.form.description')}</Label>
            <textarea
              id="wo-description"
              rows={3}
              className={textareaClass}
              placeholder={t('supervisorWorkOrders.form.descriptionPlaceholder')}
              maxLength={2000}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {t('supervisorWorkOrders.validation.descriptionRequired')}
              </p>
            )}
          </div>

          {/* Internal notes */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-notes">{t('supervisorWorkOrders.form.internalNotes')}</Label>
            <textarea
              id="wo-notes"
              rows={2}
              className={textareaClass}
              placeholder={t('supervisorWorkOrders.form.internalNotesPlaceholder')}
              maxLength={2000}
              {...register('internalNotes')}
            />
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-due-date">{t('supervisorWorkOrders.form.dueDate')}</Label>
            <Input id="wo-due-date" type="date" {...register('dueDate')} />
          </div>

          {/* Estimated duration */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-duration">
              {t('supervisorWorkOrders.form.estimatedDurationMinutes')}
            </Label>
            <Input
              id="wo-duration"
              type="number"
              min={1}
              step={1}
              {...register('estimatedDurationMinutes')}
            />
            {errors.estimatedDurationMinutes && (
              <p className="text-xs text-destructive">
                {t('supervisorWorkOrders.validation.estimatedDurationInvalid')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !!duplicateConflict}>
              {createMutation.isPending && !duplicateConflict && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
