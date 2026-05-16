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
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';

const selectClass =
  'h-9 w-full rounded-[2px] border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

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
          <FormField
            label={t('storekeeperInventory.return.quantity')}
            htmlFor="return-quantity"
            required
            hint={t('storekeeperInventory.return.quantityHint', {
              current: part?.currentStock ?? 0,
              result: Number.isFinite(resultingStock) ? resultingStock : part?.currentStock ?? 0,
            })}
            error={errors.quantity ? t('storekeeperInventory.return.validation.quantityMin') : undefined}
          >
            <Input
              id="return-quantity"
              type="number"
              min={1}
              step={1}
              {...register('quantity', {
                setValueAs: (value) => (value === '' ? NaN : Number(value)),
              })}
            />
          </FormField>

          <FormField
            label={t('storekeeperInventory.return.workOrder')}
            error={errors.workOrderId ? t('storekeeperInventory.return.validation.workOrderRequired') : undefined}
          >
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
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={returnMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <SubmitButton
              isPending={returnMutation.isPending}
              isSuccess={returnMutation.isSuccess}
              disabled={!part}
            >
              {t('storekeeperInventory.return.confirm')}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
