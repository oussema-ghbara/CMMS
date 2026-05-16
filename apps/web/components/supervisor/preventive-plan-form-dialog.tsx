'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  FormDialog,
  CANCEL_BTN_STYLE,
  DIALOG_SELECT_STYLE,
  DIALOG_FOOTER_STYLE,
} from '@/components/ui/form-dialog';

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
  const isSuccess = createMutation.isSuccess || updateMutation.isSuccess;

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

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}
      title={plan ? t('supervisorPreventivePlans.form.editTitle') : t('supervisorPreventivePlans.form.createTitle')}
      description={plan ? t('supervisorPreventivePlans.form.editDescription') : t('supervisorPreventivePlans.form.createDescription')}
      maxWidth={640}
      isPending={isPending}
    >
      <form
        onSubmit={handleSubmit(handleSubmitForm)}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {!plan && (
          <FormField
            label={t('supervisorPreventivePlans.form.asset')}
            htmlFor="assetId"
            required
            error={errors.assetId ? t('common.required') : undefined}
          >
            <Input
              id="assetSearch"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder={t('common.search')}
            />
            <select id="assetId" style={{ ...DIALOG_SELECT_STYLE, marginTop: 6 }} {...register('assetId')}>
              <option value="">{t('supervisorPreventivePlans.form.assetPlaceholder')}</option>
              {(assetQuery.data?.data ?? []).map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} · {asset.location.fullPath}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {plan && (
          <FormField label={t('supervisorPreventivePlans.form.asset')}>
            <div
              style={{
                border: '1px solid var(--sb-border)',
                borderRadius: 2,
                background: 'var(--sb-surface)',
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--sb-text-secondary)',
              }}
            >
              {plan.asset.name} · {plan.asset.qrCodeIdentifier}
            </div>
          </FormField>
        )}

        <FormField
          label={t('supervisorPreventivePlans.form.title')}
          htmlFor="title"
          required
          error={errors.title ? t('common.required') : undefined}
        >
          <Input id="title" {...register('title')} />
        </FormField>

        <FormField label={t('supervisorPreventivePlans.form.description')} htmlFor="description">
          <Input id="description" {...register('description')} />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={t('supervisorPreventivePlans.form.frequencyType')} htmlFor="frequencyType">
            <select id="frequencyType" style={DIALOG_SELECT_STYLE} {...register('frequencyType')}>
              <option value="FIXED_INTERVAL_DAYS">{t('supervisorPreventivePlans.frequencyType.FIXED_INTERVAL_DAYS')}</option>
              <option value="CALENDAR">{t('supervisorPreventivePlans.frequencyType.CALENDAR')}</option>
            </select>
          </FormField>

          <FormField
            label={t('supervisorPreventivePlans.form.estimatedDurationMinutes')}
            htmlFor="estimatedDurationMinutes"
            error={errors.estimatedDurationMinutes ? t('common.required') : undefined}
          >
            <Input id="estimatedDurationMinutes" type="number" min={1} {...register('estimatedDurationMinutes')} />
          </FormField>
        </div>

        {frequencyType === 'FIXED_INTERVAL_DAYS' ? (
          <FormField
            label={t('supervisorPreventivePlans.form.intervalDays')}
            htmlFor="intervalDays"
            required
            error={errors.intervalDays ? t('common.required') : undefined}
          >
            <Input id="intervalDays" type="number" min={1} {...register('intervalDays')} />
          </FormField>
        ) : (
          <FormField
            label={t('supervisorPreventivePlans.form.calendarExpression')}
            htmlFor="calendarExpression"
            required
            error={errors.calendarExpression ? t('common.required') : undefined}
          >
            <Input id="calendarExpression" placeholder="0 8 * * 1-5" {...register('calendarExpression')} />
          </FormField>
        )}

        <FormField label={t('supervisorPreventivePlans.form.defaultTechnician')} htmlFor="defaultTechnicianId">
          <select id="defaultTechnicianId" style={DIALOG_SELECT_STYLE} {...register('defaultTechnicianId')}>
            <option value="">{t('supervisorPreventivePlans.form.defaultTechnicianPlaceholder')}</option>
            {(technicianQuery.data ?? []).map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
        </FormField>

        {!plan && (
          <FormField label={t('supervisorPreventivePlans.form.firstDueAt')} htmlFor="firstDueAt">
            <Input id="firstDueAt" type="datetime-local" {...register('firstDueAt')} />
          </FormField>
        )}

        <div style={DIALOG_FOOTER_STYLE}>
          <button
            type="button"
            disabled={isPending}
            onClick={handleClose}
            style={CANCEL_BTN_STYLE(isPending)}
          >
            {t('common.cancel')}
          </button>
          <SubmitButton isPending={isPending} isSuccess={isSuccess}>
            {plan ? t('common.save') : t('common.create')}
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
