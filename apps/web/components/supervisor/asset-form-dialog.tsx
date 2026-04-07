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
import { Button } from '@/components/ui/button';
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
    installationDate: asset?.installationDate
      ? asset.installationDate.substring(0, 10)
      : '',
    warrantyExpiration: asset?.warrantyExpiration
      ? asset.warrantyExpiration.substring(0, 10)
      : '',
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
    if (open) {
      reset(toFormValues(asset));
    }
  }, [open, asset, reset]);

  const createMutation = useMutation({
    mutationFn: assetsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets'] });
      toast.success(t('supervisorAssets.toasts.createSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.toasts.createError')));
    },
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
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.toasts.updateError')));
    },
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

    if (isEdit && asset) {
      updateMutation.mutate({ id: asset.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const candidateParents = parentAssets?.data.filter((a) => a.id !== asset?.id) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('supervisorAssets.form.editTitle') : t('supervisorAssets.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('supervisorAssets.form.editDescription')
              : t('supervisorAssets.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* ── Identification ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('supervisorAssets.form.section.identification')}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="asset-name">{t('supervisorAssets.form.name')}</Label>
              <Input id="asset-name" {...register('name')} maxLength={200} />
              {errors.name && (
                <p className="text-xs text-destructive">{t('supervisorAssets.validation.nameRequired')}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-category">{t('supervisorAssets.form.category')}</Label>
                <select id="asset-category" className={selectClass} {...register('categoryId')}>
                  <option value="">{t('supervisorAssets.form.categoryPlaceholder')}</option>
                  {(categories ?? []).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {errors.categoryId && (
                  <p className="text-xs text-destructive">{t('supervisorAssets.validation.categoryRequired')}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-criticality">{t('supervisorAssets.form.criticality')}</Label>
                <select id="asset-criticality" className={selectClass} {...register('criticality')}>
                  <option value={AssetCriticality.CRITICAL}>{t('supervisorAssets.criticality.CRITICAL')}</option>
                  <option value={AssetCriticality.STANDARD}>{t('supervisorAssets.criticality.STANDARD')}</option>
                  <option value={AssetCriticality.NON_CRITICAL}>{t('supervisorAssets.criticality.NON_CRITICAL')}</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-location">{t('supervisorAssets.form.location')}</Label>
              <select id="asset-location" className={selectClass} {...register('locationId')}>
                <option value="">{t('supervisorAssets.form.locationPlaceholder')}</option>
                {(locations ?? []).map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.fullPath}
                  </option>
                ))}
              </select>
              {errors.locationId && (
                <p className="text-xs text-destructive">{t('supervisorAssets.validation.locationRequired')}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-description">{t('supervisorAssets.form.description')}</Label>
              <Input id="asset-description" {...register('description')} maxLength={1000} />
            </div>
          </div>

          {/* ── Technical ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('supervisorAssets.form.section.technical')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-serial">{t('supervisorAssets.form.serialNumber')}</Label>
                <Input id="asset-serial" {...register('serialNumber')} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-manufacturer">{t('supervisorAssets.form.manufacturer')}</Label>
                <Input id="asset-manufacturer" {...register('manufacturer')} maxLength={100} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-model">{t('supervisorAssets.form.model')}</Label>
                <Input id="asset-model" {...register('model')} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-installation">{t('supervisorAssets.form.installationDate')}</Label>
                <Input id="asset-installation" type="date" {...register('installationDate')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-warranty">{t('supervisorAssets.form.warrantyExpiration')}</Label>
              <Input id="asset-warranty" type="date" {...register('warrantyExpiration')} />
            </div>
          </div>

          {/* ── Hierarchy ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('supervisorAssets.form.section.hierarchy')}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="asset-parent">{t('supervisorAssets.form.parent')}</Label>
              <select id="asset-parent" className={selectClass} {...register('parentId')}>
                <option value="">{t('supervisorAssets.form.parentPlaceholder')}</option>
                {candidateParents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.location.fullPath}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save') : t('supervisorAssets.actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
