'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2 } from 'lucide-react';
import { WorkOrderType, WorkOrderPriority } from '@gmao/shared';
import { workOrdersApi } from '@/lib/work-orders.api';
import { assetsApi } from '@/lib/assets.api';
import { Button } from '@/components/ui/button';
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

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
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

  const {
    register,
    handleSubmit,
    reset,
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

  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ['supervisor', 'assets', 'all-for-select'],
    queryFn: () => assetsApi.list({ page: 1, limit: 100 }),
    enabled: open && isInitialized,
  });

  const createMutation = useMutation({
    mutationFn: (values: WorkOrderFormValues) =>
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
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'work-orders'] });
      toast.success(t('supervisorWorkOrders.toasts.createSuccess'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorWorkOrders.toasts.createError')));
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit = (values: WorkOrderFormValues) => {
    createMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('supervisorWorkOrders.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('supervisorWorkOrders.form.createDescription')}</DialogDescription>
        </DialogHeader>

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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
