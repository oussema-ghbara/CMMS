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
import { AssetCriticality } from '@gmao/shared';
import { assetsApi, type AssetListItem, type AssetDetail } from '@/lib/assets.api';
import { locationsApi } from '@/lib/locations.api';
import { categoriesApi } from '@/lib/categories.api';
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

const assetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().min(1),
  locationId: z.string().min(1),
  criticality: z.nativeEnum(AssetCriticality),
  description: z.string().trim().max(1000).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  installationDate: z.string().optional(),
  warrantyExpiration: z.string().optional(),
  parentId: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function toFormValues(asset?: AssetListItem | AssetDetail | null): AssetFormValues {
  return {
    name: asset?.name ?? '',
    categoryId: asset?.category?.id ?? '',
    locationId: asset?.location?.id ?? '',
    criticality: asset?.criticality ?? AssetCriticality.STANDARD,
    description: asset?.description ?? '',
    serialNumber: asset?.serialNumber ?? '',
    manufacturer: asset?.manufacturer ?? '',
    model: asset?.model ?? '',
    installationDate: asset?.installationDate ? asset.installationDate.substring(0, 10) : '',
    warrantyExpiration: asset?.warrantyExpiration ? asset.warrantyExpiration.substring(0, 10) : '',
    parentId: asset?.parent?.id ?? '',
  };
}

interface AssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetListItem | AssetDetail | null;
  onSuccess: () => void;
}

export function AssetFormDialog({ open, onOpenChange, asset, onSuccess }: AssetFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!asset;

  const { data: categories } = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => categoriesApi.list(),
    enabled: open,
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list(),
    enabled: open,
  });

  const { data: parentAssets } = useQuery({
    queryKey: ['supervisor', 'assets', 'parent-candidates'],
    queryFn: () => assetsApi.list({ limit: 100 }),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: toFormValues(),
  });

  useEffect(() => {
    if (open) reset(toFormValues(asset));
  }, [open, asset, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const createMutation = useMutation({
    mutationFn: assetsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets'] });
      toast.success(t('supervisorAssets.toasts.createSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => { toast.error(getErrorMessage(error, t('supervisorAssets.toasts.createError'))); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof assetsApi.update>[1] }) =>
      assetsApi.update(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets'] });
      toast.success(t('supervisorAssets.toasts.updateSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => { toast.error(getErrorMessage(error, t('supervisorAssets.toasts.updateError'))); },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: AssetFormValues) => {
    const payload = {
      name: values.name.trim(),
      categoryId: values.categoryId,
      locationId: values.locationId,
      criticality: values.criticality,
      description: values.description?.trim() || undefined,
      serialNumber: values.serialNumber?.trim() || undefined,
      manufacturer: values.manufacturer?.trim() || undefined,
      model: values.model?.trim() || undefined,
      installationDate: values.installationDate || undefined,
      warrantyExpiration: values.warrantyExpiration || undefined,
      parentId: values.parentId || undefined,
    };

    if (isEdit && asset) { updateMutation.mutate({ id: asset.id, payload }); return; }
    createMutation.mutate(payload);
  };

  const candidateParents = parentAssets?.data.filter((a) => a.id !== asset?.id) ?? [];

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
            {isEdit ? t('supervisorAssets.form.editTitle') : t('supervisorAssets.form.createTitle')}
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

          {/* Identification section */}
          <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: -6, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            {t('supervisorAssets.form.section.identification')}
          </Mono>

          {/* Name */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorAssets.form.name')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <input {...register('name')} maxLength={200} style={{ ...inputS, borderColor: errors.name ? 'var(--sb-p-crit)' : 'var(--sb-border)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.name ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            />
            {errors.name && <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('supervisorAssets.validation.nameRequired')}</Mono>}
          </div>

          {/* Category + Criticality (2-col) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('supervisorAssets.form.category')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
              </Mono>
              <select {...register('categoryId')} style={{ ...selectS, borderColor: errors.categoryId ? 'var(--sb-p-crit)' : 'var(--sb-border)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = errors.categoryId ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
              >
                <option value="">{t('supervisorAssets.form.categoryPlaceholder')}</option>
                {(categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {errors.categoryId && <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('supervisorAssets.validation.categoryRequired')}</Mono>}
            </div>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('supervisorAssets.form.criticality')}
              </Mono>
              <select {...register('criticality')} style={selectS}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              >
                <option value={AssetCriticality.CRITICAL}>{t('supervisorAssets.criticality.CRITICAL')}</option>
                <option value={AssetCriticality.STANDARD}>{t('supervisorAssets.criticality.STANDARD')}</option>
                <option value={AssetCriticality.NON_CRITICAL}>{t('supervisorAssets.criticality.NON_CRITICAL')}</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorAssets.form.location')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <select {...register('locationId')} style={{ ...selectS, borderColor: errors.locationId ? 'var(--sb-p-crit)' : 'var(--sb-border)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.locationId ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            >
              <option value="">{t('supervisorAssets.form.locationPlaceholder')}</option>
              {(locations ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.fullPath}</option>
              ))}
            </select>
            {errors.locationId && <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('supervisorAssets.validation.locationRequired')}</Mono>}
          </div>

          {/* Description */}
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorAssets.form.description')}
            </Mono>
            <input {...register('description')} maxLength={1000} style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            />
          </div>

          {/* Technical section */}
          <div style={{ borderTop: '1px solid var(--sb-border)', paddingTop: 14 }}>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {t('supervisorAssets.form.section.technical')}
            </Mono>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorAssets.form.serialNumber')}</Mono>
                  <input {...register('serialNumber')} maxLength={100} style={{ ...inputS, fontFamily: MONO, letterSpacing: '0.04em' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
                  />
                </div>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorAssets.form.manufacturer')}</Mono>
                  <input {...register('manufacturer')} maxLength={100} style={inputS}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorAssets.form.model')}</Mono>
                  <input {...register('model')} maxLength={100} style={inputS}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
                  />
                </div>
                <div>
                  <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorAssets.form.installationDate')}</Mono>
                  <input type="date" {...register('installationDate')} style={inputS}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
                  />
                </div>
              </div>
              <div>
                <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorAssets.form.warrantyExpiration')}</Mono>
                <input type="date" {...register('warrantyExpiration')} style={{ ...inputS, width: '50%' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
                />
              </div>
            </div>
          </div>

          {/* Hierarchy section */}
          <div style={{ borderTop: '1px solid var(--sb-border)', paddingTop: 14 }}>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {t('supervisorAssets.form.section.hierarchy')}
            </Mono>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>{t('supervisorAssets.form.parent')}</Mono>
              <select {...register('parentId')} style={selectS}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              >
                <option value="">{t('supervisorAssets.form.parentPlaceholder')}</option>
                {candidateParents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.location.fullPath}</option>
                ))}
              </select>
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
              {isEdit ? t('common.save') : t('supervisorAssets.actions.create')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
