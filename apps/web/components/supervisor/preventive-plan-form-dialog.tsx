'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Role } from '@gmao/shared';
import { assetsApi } from '@/lib/assets.api';
import {
  preventivePlansApi,
  type PreventiveFrequencyType,
  type PreventivePlanItem,
} from '@/lib/preventive-plans.api';
import { usersApi } from '@/lib/users.api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PlanFormValues = {
  assetId: string;
  title: string;
  description: string;
  frequencyType: PreventiveFrequencyType;
  intervalDays: string;
  calendarExpression: string;
  estimatedDurationMinutes: string;
  defaultTechnicianId: string;
  firstDueAt: string;
};

function buildSchema(isEdit: boolean) {
  return z
    .object({
      assetId: z.string().optional(),
      title: z.string().trim().min(1),
      description: z.string().trim().optional(),
      frequencyType: z.enum(['FIXED_INTERVAL_DAYS', 'CALENDAR']),
      intervalDays: z.string().trim().optional(),
      calendarExpression: z.string().trim().optional(),
      estimatedDurationMinutes: z.string().trim().optional(),
      defaultTechnicianId: z.string().trim().optional(),
      firstDueAt: z.string().trim().optional(),
    })
    .superRefine((values, context) => {
      if (!isEdit && !values.assetId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['assetId'], message: 'required' });
      }

      if (values.frequencyType === 'FIXED_INTERVAL_DAYS') {
        const parsed = values.intervalDays ? Number(values.intervalDays) : Number.NaN;
        if (!Number.isInteger(parsed) || parsed < 1) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['intervalDays'], message: 'required' });
        }
      }

      if (values.frequencyType === 'CALENDAR' && !values.calendarExpression?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['calendarExpression'], message: 'required' });
      }

      if (values.estimatedDurationMinutes) {
        const parsed = Number(values.estimatedDurationMinutes);
        if (!Number.isInteger(parsed) || parsed < 1) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedDurationMinutes'], message: 'required' });
        }
      }
    });
}

interface PreventivePlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PreventivePlanItem | null;
  onSuccess: () => void;
}

export function PreventivePlanFormDialog({ open, onOpenChange, plan, onSuccess }: PreventivePlanFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!plan;
  const [assetSearch, setAssetSearch] = useState('');

  const schema = useMemo(() => buildSchema(isEdit), [isEdit]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      assetId: '',
      title: '',
      description: '',
      frequencyType: 'FIXED_INTERVAL_DAYS',
      intervalDays: '',
      calendarExpression: '',
      estimatedDurationMinutes: '',
      defaultTechnicianId: '',
      firstDueAt: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setAssetSearch('');

    reset(
      plan
        ? {
            assetId: plan.assetId,
            title: plan.title,
            description: plan.description ?? '',
            frequencyType: plan.frequencyType,
            intervalDays: plan.intervalDays?.toString() ?? '',
            calendarExpression: plan.calendarExpression ?? '',
            estimatedDurationMinutes: plan.estimatedDurationMinutes?.toString() ?? '',
            defaultTechnicianId: plan.defaultTechnicianId ?? '',
            firstDueAt: '',
          }
        : {
            assetId: '',
            title: '',
            description: '',
            frequencyType: 'FIXED_INTERVAL_DAYS',
            intervalDays: '',
            calendarExpression: '',
            estimatedDurationMinutes: '',
            defaultTechnicianId: '',
            firstDueAt: '',
          },
    );
  }, [open, plan, reset]);

  const frequencyType = watch('frequencyType');

  const assetQuery = useQuery({
    queryKey: ['supervisor', 'preventive-plans', 'assets', assetSearch],
    queryFn: () =>
      assetsApi.list({
        page: 1,
        limit: 20,
        ...(assetSearch.trim() ? { search: assetSearch.trim() } : {}),
      }),
    enabled: open && !plan,
  });

  const technicianQuery = useQuery({
    queryKey: ['supervisor', 'preventive-plans', 'technicians'],
    queryFn: () => usersApi.list({ role: Role.TECHNICIAN, isActive: true }),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: preventivePlansApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.createSuccess'));
      onSuccess();
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.createError')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof preventivePlansApi.update>[1] }) =>
      preventivePlansApi.update(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.updateSuccess'));
      onSuccess();
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.updateError')),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmitForm = (values: PlanFormValues) => {
    const payload = {
      assetId: values.assetId,
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      frequencyType: values.frequencyType,
      intervalDays:
        values.frequencyType === 'FIXED_INTERVAL_DAYS' && values.intervalDays.trim()
          ? Number(values.intervalDays.trim())
          : undefined,
      calendarExpression:
        values.frequencyType === 'CALENDAR' && values.calendarExpression.trim()
          ? values.calendarExpression.trim()
          : undefined,
      estimatedDurationMinutes: values.estimatedDurationMinutes.trim()
        ? Number(values.estimatedDurationMinutes.trim())
        : undefined,
      defaultTechnicianId: values.defaultTechnicianId.trim() || undefined,
      firstDueAt: !isEdit && values.firstDueAt ? new Date(values.firstDueAt).toISOString() : undefined,
    };

    if (isEdit && plan) {
      const updatePayload: Parameters<typeof preventivePlansApi.update>[1] = {
        title: payload.title,
        description: payload.description,
        frequencyType: payload.frequencyType,
        intervalDays: payload.intervalDays,
        calendarExpression: payload.calendarExpression,
        estimatedDurationMinutes: payload.estimatedDurationMinutes,
        defaultTechnicianId: payload.defaultTechnicianId,
      };
      updateMutation.mutate({ id: plan.id, payload: updatePayload });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {plan ? t('supervisorPreventivePlans.form.editTitle') : t('supervisorPreventivePlans.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {plan
              ? t('supervisorPreventivePlans.form.editDescription')
              : t('supervisorPreventivePlans.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(handleSubmitForm)}>
          {!plan && (
            <div className="space-y-2">
              <Label htmlFor="assetId">{t('supervisorPreventivePlans.form.asset')}</Label>
              <Input
                id="assetSearch"
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder={t('common.search')}
              />
              <select id="assetId" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('assetId')}>
                <option value="">{t('supervisorPreventivePlans.form.assetPlaceholder')}</option>
                {(assetQuery.data?.data ?? []).map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} · {asset.location.fullPath}
                  </option>
                ))}
              </select>
              {errors.assetId && <p className="text-xs text-destructive">{t('common.required')}</p>}
            </div>
          )}

          {plan && (
            <div className="space-y-2">
              <Label>{t('supervisorPreventivePlans.form.asset')}</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {plan.asset.name} · {plan.asset.qrCodeIdentifier}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">{t('supervisorPreventivePlans.form.title')}</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{t('common.required')}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('supervisorPreventivePlans.form.description')}</Label>
            <Input id="description" {...register('description')} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="frequencyType">{t('supervisorPreventivePlans.form.frequencyType')}</Label>
              <select id="frequencyType" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('frequencyType')}>
                <option value="FIXED_INTERVAL_DAYS">{t('supervisorPreventivePlans.frequencyType.FIXED_INTERVAL_DAYS')}</option>
                <option value="CALENDAR">{t('supervisorPreventivePlans.frequencyType.CALENDAR')}</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedDurationMinutes">{t('supervisorPreventivePlans.form.estimatedDurationMinutes')}</Label>
              <Input id="estimatedDurationMinutes" type="number" min={1} {...register('estimatedDurationMinutes')} />
              {errors.estimatedDurationMinutes && <p className="text-xs text-destructive">{t('common.required')}</p>}
            </div>
          </div>

          {frequencyType === 'FIXED_INTERVAL_DAYS' ? (
            <div className="space-y-2">
              <Label htmlFor="intervalDays">{t('supervisorPreventivePlans.form.intervalDays')}</Label>
              <Input id="intervalDays" type="number" min={1} {...register('intervalDays')} />
              {errors.intervalDays && <p className="text-xs text-destructive">{t('common.required')}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="calendarExpression">{t('supervisorPreventivePlans.form.calendarExpression')}</Label>
              <Input id="calendarExpression" placeholder="0 8 * * 1-5" {...register('calendarExpression')} />
              {errors.calendarExpression && <p className="text-xs text-destructive">{t('common.required')}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="defaultTechnicianId">{t('supervisorPreventivePlans.form.defaultTechnician')}</Label>
            <select id="defaultTechnicianId" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('defaultTechnicianId')}>
              <option value="">{t('supervisorPreventivePlans.form.defaultTechnicianPlaceholder')}</option>
              {(technicianQuery.data ?? []).map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </div>

          {!plan && (
            <div className="space-y-2">
              <Label htmlFor="firstDueAt">{t('supervisorPreventivePlans.form.firstDueAt')}</Label>
              <Input id="firstDueAt" type="datetime-local" {...register('firstDueAt')} />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {plan ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}