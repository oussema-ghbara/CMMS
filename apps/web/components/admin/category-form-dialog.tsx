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
  categoriesApi,
  type CategoryItem,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
} from '@/lib/categories.api';
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
  return {
    name: category?.name ?? '',
    description: category?.description ?? '',
  };
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
    if (open) {
      reset(toFormValues(category));
    }
  }, [open, category, reset]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateCategoryPayload) => categoriesApi.create(payload),
    onSuccess: () => {
      toast.success(t('admin.categories.toasts.createSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.categories.toasts.createError')));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) =>
      categoriesApi.update(id, payload),
    onSuccess: () => {
      toast.success(t('admin.categories.toasts.updateSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.categories.toasts.updateError')));
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: CategoryFormValues) => {
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
    };

    if (isEdit && category) {
      updateMutation.mutate({ id: category.id, payload });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('admin.categories.dialog.editTitle') : t('admin.categories.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('admin.categories.dialog.editDescription')
              : t('admin.categories.dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category-name">{t('admin.categories.form.name')}</Label>
            <Input id="category-name" {...register('name')} maxLength={100} />
            {errors.name && (
              <p className="text-xs text-destructive">{t('admin.categories.validation.nameRequired')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category-description">{t('admin.categories.form.description')}</Label>
            <Input id="category-description" {...register('description')} maxLength={500} />
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
