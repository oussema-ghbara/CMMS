'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2 } from 'lucide-react';
import { WorkOrderStatus } from '@gmao/shared';
import { inventoryApi, type PartCatalogItem } from '@/lib/inventory.api';
import { workOrdersApi } from '@/lib/work-orders.api';
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

const returnSchema = z.object({
  quantity: z.number().int().min(1),
  workOrderId: z.string().trim().min(1),
});

type ReturnFormValues = z.infer<typeof returnSchema>;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

interface StockReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartCatalogItem | null;
}

export function StockReturnDialog({ open, onOpenChange, part }: StockReturnDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [woSearch, setWoSearch] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<ReturnFormValues>({
    resolver: zodResolver(returnSchema),
    defaultValues: { quantity: 1, workOrderId: '' },
  });

  // Fetch cancelled work orders to select from
  const { data: cancelledWOs, isLoading: wosLoading } = useQuery({
    queryKey: ['storekeeper', 'cancelled-work-orders'],
    queryFn: () => workOrdersApi.list({ status: WorkOrderStatus.CANCELLED, limit: 100 }),
    enabled: open,
    staleTime: 30_000,
  });

  const filteredWOs = useMemo(() => {
    const list = cancelledWOs?.data ?? [];
    if (!woSearch.trim()) return list;
    const lower = woSearch.toLowerCase();
    return list.filter(
      (wo) =>
        wo.referenceNumber.toLowerCase().includes(lower) ||
        wo.asset.name.toLowerCase().includes(lower),
    );
  }, [cancelledWOs, woSearch]);

  useEffect(() => {
    if (open) {
      reset({ quantity: 1, workOrderId: '' });
      setWoSearch('');
    }
  }, [open, part?.id, reset]);

  const returnMutation = useMutation({
    mutationFn: (values: ReturnFormValues) =>
      inventoryApi.recordReturn({
        partId: part!.id,
        quantity: values.quantity,
        workOrderId: values.workOrderId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'low-stock'] });
      toast.success(t('storekeeperInventory.return.toasts.success'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('storekeeperInventory.return.toasts.error')));
    },
  });

  const watchedQuantity = watch('quantity');
  const resultingStock =
    Number(part?.currentStock ?? 0) + (Number.isFinite(watchedQuantity) ? watchedQuantity : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('storekeeperInventory.return.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('storekeeperInventory.return.dialogDescription', { name: part?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => returnMutation.mutate(v))} className="space-y-4">
          {/* Quantity */}
          <div className="space-y-1.5">
            <Label htmlFor="return-quantity">{t('storekeeperInventory.return.quantity')}</Label>
            <Input
              id="return-quantity"
              type="number"
              min={1}
              step={1}
              {...register('quantity', {
                setValueAs: (value) => (value === '' ? NaN : Number(value)),
              })}
            />
            <p className="text-xs text-muted-foreground">
              {t('storekeeperInventory.return.quantityHint', {
                current: part?.currentStock ?? 0,
                result: Number.isFinite(resultingStock) ? resultingStock : part?.currentStock ?? 0,
              })}
            </p>
            {errors.quantity && (
              <p className="text-xs text-destructive">
                {t('storekeeperInventory.return.validation.quantityMin')}
              </p>
            )}
          </div>

          {/* Work order select */}
          <div className="space-y-1.5">
            <Label>{t('storekeeperInventory.return.workOrder')}</Label>
            <Input
              placeholder={t('storekeeperInventory.return.woSearchPlaceholder')}
              value={woSearch}
              onChange={(e) => setWoSearch(e.target.value)}
            />
            {wosLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('storekeeperInventory.return.loadingWOs')}
              </div>
            ) : (
              <select
                className={selectClass}
                defaultValue=""
                onChange={(e) => setValue('workOrderId', e.target.value, { shouldValidate: true })}
              >
                <option value="" disabled>
                  {t('storekeeperInventory.return.woPlaceholder')}
                </option>
                {filteredWOs.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.referenceNumber} — {wo.asset.name}
                  </option>
                ))}
              </select>
            )}
            {filteredWOs.length === 0 && !wosLoading && (
              <p className="text-xs text-muted-foreground">
                {t('storekeeperInventory.return.noWOs')}
              </p>
            )}
            {errors.workOrderId && (
              <p className="text-xs text-destructive">
                {t('storekeeperInventory.return.validation.workOrderRequired')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={returnMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={returnMutation.isPending || !part}>
              {returnMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('storekeeperInventory.return.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
