'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2 } from 'lucide-react';
import {
  locationsApi,
  type LocationItem,
  type CreateLocationPayload,
  type UpdateLocationPayload,
} from '@/lib/locations.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

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

export function LocationFormDialog({
  open,
  onOpenChange,
  location,
  locations,
  onSuccess,
}: LocationFormDialogProps) {
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
    if (open) {
      reset(toFormValues(location));
    }
  }, [open, location, reset]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateLocationPayload) => locationsApi.create(payload),
    onSuccess: () => {
      toast.success(t('admin.locations.toasts.createSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.locations.toasts.createError')));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateLocationPayload }) =>
      locationsApi.update(id, payload),
    onSuccess: () => {
      toast.success(t('admin.locations.toasts.updateSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.locations.toasts.updateError')));
    },
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

    if (isEdit && location) {
      updateMutation.mutate({ id: location.id, payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const parentCandidates = locations.filter((item) => item.id !== location?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('admin.locations.dialog.editTitle') : t('admin.locations.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('admin.locations.dialog.editDescription')
              : t('admin.locations.dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="location-name">{t('admin.locations.form.name')}</Label>
            <Input id="location-name" {...register('name')} maxLength={100} />
            {errors.name && (
              <p className="text-xs text-destructive">{t('admin.locations.validation.nameRequired')}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="location-level">{t('admin.locations.form.level')}</Label>
              <select id="location-level" className={selectClass} {...register('level')}>
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {t('admin.locations.form.levelOption', { level })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location-code">{t('admin.locations.form.code')}</Label>
              <Input id="location-code" {...register('code')} maxLength={20} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-parent">{t('admin.locations.form.parent')}</Label>
            <select id="location-parent" className={selectClass} {...register('parentId')}>
              <option value="">{t('admin.locations.form.parentNone')}</option>
              {parentCandidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullPath}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-description">{t('admin.locations.form.description')}</Label>
            <Input id="location-description" {...register('description')} maxLength={500} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
