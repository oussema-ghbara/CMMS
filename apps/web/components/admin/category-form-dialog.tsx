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
  categoriesApi,
  type CategoryItem,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
} from '@/lib/categories.api';
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

const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryItem | null;
  onSuccess: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function toFormValues(category?: CategoryItem | null): CategoryFormValues {
  return { name: category?.name ?? '', description: category?.description ?? '' };
}

export function CategoryFormDialog({ open, onOpenChange, category, onSuccess }: CategoryFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!category;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: toFormValues(),
  });

  useEffect(() => {
    if (open) reset(toFormValues(category));
  }, [open, category, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateCategoryPayload) => categoriesApi.create(payload),
    onSuccess: () => { toast.success(t('admin.categories.toasts.createSuccess')); onSuccess(); onOpenChange(false); },
    onError: (error) => { toast.error(getErrorMessage(error, t('admin.categories.toasts.createError'))); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) => categoriesApi.update(id, payload),
    onSuccess: () => { toast.success(t('admin.categories.toasts.updateSuccess')); onSuccess(); onOpenChange(false); },
    onError: (error) => { toast.error(getErrorMessage(error, t('admin.categories.toasts.updateError'))); },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: CategoryFormValues) => {
    const payload = { name: values.name.trim(), description: values.description?.trim() || undefined };
    if (isEdit && category) { updateMutation.mutate({ id: category.id, payload }); return; }
    createMutation.mutate(payload);
  };

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
      <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 420 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
            {isEdit ? t('admin.categories.dialog.editTitle') : t('admin.categories.dialog.createTitle')}
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

          {/* Name */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.categories.form.name')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <input
              {...register('name')}
              maxLength={100}
              style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.name ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            />
            {errors.name && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('admin.categories.validation.nameRequired')}</Mono>
            )}
          </div>

          {/* Description */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.categories.form.description')}
            </Mono>
            <input
              {...register('description')}
              maxLength={500}
              style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            />
          </div>

          {/* Footer */}
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
