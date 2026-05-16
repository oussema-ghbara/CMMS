'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { AlertTriangle } from 'lucide-react';
import { StockAdjustmentReason } from '@gmao/shared';
import { inventoryApi, type PartCatalogItem } from '@/lib/inventory.api';
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
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';

const selectClass =
  'h-9 w-full rounded-[2px] border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

const adjustmentSchema = z
  .object({
    quantity: z
      .number()
      .int()
      .refine((value) => value !== 0, {
        message: 'nonZero',
      }),
    reason: z.nativeEnum(StockAdjustmentReason),
    detail: z.string().trim().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.reason === StockAdjustmentReason.OTHER && !values.detail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['detail'],
        message: 'required',
      });
    }
  });

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartCatalogItem | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

const REASON_OPTIONS = [
  StockAdjustmentReason.PHYSICAL_DAMAGE,
  StockAdjustmentReason.COUNTING_ERROR,
  StockAdjustmentReason.LOSS_OR_THEFT,
  StockAdjustmentReason.SUPPLIER_ERROR,
  StockAdjustmentReason.OTHER,
] as const;

export function StockAdjustmentDialog({ open, onOpenChange, part }: StockAdjustmentDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      quantity: 0,
      reason: StockAdjustmentReason.COUNTING_ERROR,
      detail: '',
    },
  });

  const watchedQuantity = watch('quantity');
  const watchedReason = watch('reason');

  const resultingStock = useMemo(
    () => Number(part?.currentStock ?? 0) + (Number.isFinite(watchedQuantity) ? watchedQuantity : 0),
    [part?.currentStock, watchedQuantity],
  );

  const wouldBeNegative = Number.isFinite(watchedQuantity) && resultingStock < 0;

  const adjustmentMutation = useMutation({
    mutationFn: (values: AdjustmentFormValues) =>
      inventoryApi.recordAdjustment({
        partId: part!.id,
        quantity: values.quantity,
        reason: values.reason,
        detail: values.detail?.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'low-stock'] });
      toast.success(t('storekeeperInventory.toasts.adjustmentSuccess'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('storekeeperInventory.toasts.adjustmentError')));
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        quantity: 0,
        reason: StockAdjustmentReason.COUNTING_ERROR,
        detail: '',
      });
    }
  }, [open, reset, part?.id]);

  const onSubmit = (values: AdjustmentFormValues) => {
    if (!part || wouldBeNegative) return;
    adjustmentMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('storekeeperInventory.adjustment.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('storekeeperInventory.adjustment.dialogDescription', { name: part?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label={t('storekeeperInventory.adjustment.quantity')}
            htmlFor="adjustment-quantity"
            required
            hint={t('storekeeperInventory.adjustment.quantityHint', {
              current: part?.currentStock ?? 0,
              result: Number.isFinite(resultingStock) ? resultingStock : part?.currentStock ?? 0,
            })}
            error={
              errors.quantity
                ? t('storekeeperInventory.validation.adjustmentQuantity')
                : wouldBeNegative
                  ? t('storekeeperInventory.validation.adjustmentNegativeResult')
                  : undefined
            }
          >
            <Input
              id="adjustment-quantity"
              type="number"
              step={1}
              {...register('quantity', {
                setValueAs: (value) => (value === '' ? NaN : Number(value)),
              })}
            />
          </FormField>

          {wouldBeNegative && (
            <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--sb-p-crit)' }}>
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('storekeeperInventory.validation.adjustmentNegativeResult')}
            </p>
          )}

          <FormField
            label={t('storekeeperInventory.adjustment.reason')}
            htmlFor="adjustment-reason"
          >
            <select id="adjustment-reason" className={selectClass} {...register('reason')}>
              {REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`storekeeperInventory.adjustment.reasons.${reason}`)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label={t('storekeeperInventory.adjustment.detail')}
            htmlFor="adjustment-detail"
            error={errors.detail ? t('storekeeperInventory.validation.adjustmentDetailRequiredForOther') : undefined}
          >
            <Input id="adjustment-detail" maxLength={500} {...register('detail')} />
            {watchedReason === StockAdjustmentReason.OTHER && !errors.detail && (
              <p className="text-xs text-muted-foreground">
                {t('storekeeperInventory.validation.adjustmentDetailRequiredForOther')}
              </p>
            )}
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={adjustmentMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <SubmitButton
              isPending={adjustmentMutation.isPending}
              isSuccess={adjustmentMutation.isSuccess}
              disabled={!part || wouldBeNegative}
            >
              {t('storekeeperInventory.actions.adjustStock')}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
