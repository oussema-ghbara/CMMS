'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AxiosError } from 'axios';
import {
  locationsApi,
  type LocationItem,
  type CreateLocationPayload,
  type UpdateLocationPayload,
} from '@/lib/locations.api';
import { Mono } from '@/components/ui/mono';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const inputS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 32,
  padding: '0 4px 0 10px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
};

const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  level: z.coerce.number().int().min(1).max(5),
  parentId: z.string().optional(),
});

type LocationFormValues = z.infer<typeof locationSchema>;

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationItem | null;
  locations: LocationItem[];
  onSuccess: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function toFormValues(location?: LocationItem | null): LocationFormValues {
  return {
    name: location?.name ?? '',
    code: location?.code ?? '',
    description: location?.description ?? '',
    level: location?.level ?? 1,
    parentId: location?.parentId ?? '',
  };
}

export function LocationFormDialog({ open, onOpenChange, location, locations, onSuccess }: LocationFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!location;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: toFormValues(),
  });

  useEffect(() => {
    if (open) reset(toFormValues(location));
  }, [open, location, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateLocationPayload) => locationsApi.create(payload),
    onSuccess: () => { toast.success(t('admin.locations.toasts.createSuccess')); onSuccess(); onOpenChange(false); },
    onError: (error) => { toast.error(getErrorMessage(error, t('admin.locations.toasts.createError'))); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateLocationPayload }) => locationsApi.update(id, payload),
    onSuccess: () => { toast.success(t('admin.locations.toasts.updateSuccess')); onSuccess(); onOpenChange(false); },
    onError: (error) => { toast.error(getErrorMessage(error, t('admin.locations.toasts.updateError'))); },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: LocationFormValues) => {
    const payload = {
      name: values.name.trim(),
      level: values.level,
      code: values.code?.trim() || undefined,
      description: values.description?.trim() || undefined,
      parentId: values.parentId || undefined,
    };
    if (isEdit && location) { updateMutation.mutate({ id: location.id, payload }); return; }
    createMutation.mutate(payload);
  };

  const parentCandidates = locations.filter((item) => item.id !== location?.id);

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
      <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 460, maxHeight: '90vh', overflowY: 'auto' }}>

        { }
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
            {isEdit ? t('admin.locations.dialog.editTitle') : t('admin.locations.dialog.createTitle')}
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

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          { }
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.locations.form.name')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <input
              {...register('name')}
              maxLength={100}
              style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.name ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            />
            {errors.name && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('admin.locations.validation.nameRequired')}</Mono>
            )}
          </div>

          { }
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('admin.locations.form.level')}
              </Mono>
              <select
                {...register('level')}
                style={selectS}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              >
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {t('admin.locations.form.levelOption', { level })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('admin.locations.form.code')}
              </Mono>
              <input
                {...register('code')}
                maxLength={20}
                style={{ ...inputS, fontFamily: MONO, letterSpacing: '0.05em' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              />
            </div>
          </div>

          { }
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.locations.form.parent')}
            </Mono>
            <select
              {...register('parentId')}
              style={selectS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            >
              <option value="">{t('admin.locations.form.parentNone')}</option>
              {parentCandidates.map((item) => (
                <option key={item.id} value={item.id}>{item.fullPath}</option>
              ))}
            </select>
          </div>

          { }
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.locations.form.description')}
            </Mono>
            <input
              {...register('description')}
              maxLength={500}
              style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            />
          </div>

          { }
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--sb-border)', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              style={{
                background: 'transparent',
                border: '1px solid var(--sb-border-strong)',
                borderRadius: 2, padding: '6px 16px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                color: 'var(--sb-text-secondary)',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.5 : 1,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: isPending ? 'var(--sb-border)' : 'var(--sb-text-primary)',
                color: isPending ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
                border: 'none', borderRadius: 2, padding: '6px 16px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
              {isEdit ? t('common.save') : t('common.create')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
