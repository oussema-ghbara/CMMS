'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, AlertTriangle } from 'lucide-react';
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
import { Label } from '@/components/ui/label';

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
        message: 'requiredForOther',
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

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

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
          <div className="space-y-1.5">
            <Label htmlFor="adjustment-quantity">{t('storekeeperInventory.adjustment.quantity')}</Label>
            <Input
              id="adjustment-quantity"
              type="number"
              step={1}
              {...register('quantity', {
                setValueAs: (value) => (value === '' ? NaN : Number(value)),
              })}
            />
            <p className="text-xs text-muted-foreground">
              {t('storekeeperInventory.adjustment.quantityHint', {
                current: part?.currentStock ?? 0,
                result: Number.isFinite(resultingStock) ? resultingStock : part?.currentStock ?? 0,
              })}
            </p>
            {errors.quantity && (
              <p className="text-xs text-destructive">
                {t('storekeeperInventory.validation.adjustmentQuantity')}
              </p>
            )}
            {wouldBeNegative && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('storekeeperInventory.validation.adjustmentNegativeResult')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjustment-reason">{t('storekeeperInventory.adjustment.reason')}</Label>
            <select id="adjustment-reason" className={selectClass} {...register('reason')}>
              {REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`storekeeperInventory.adjustment.reasons.${reason}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjustment-detail">{t('storekeeperInventory.adjustment.detail')}</Label>
            <Input id="adjustment-detail" maxLength={500} {...register('detail')} />
            {watchedReason === StockAdjustmentReason.OTHER && (
              <p className="text-xs text-muted-foreground">
                {t('storekeeperInventory.validation.adjustmentDetailRequiredForOther')}
              </p>
            )}
            {errors.detail && (
              <p className="text-xs text-destructive">
                {t('storekeeperInventory.validation.adjustmentDetailRequiredForOther')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={adjustmentMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={adjustmentMutation.isPending || !part || wouldBeNegative}
            >
              {adjustmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('storekeeperInventory.actions.adjustStock')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
