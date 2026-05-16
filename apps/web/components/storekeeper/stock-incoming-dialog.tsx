'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
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

const incomingSchema = z.object({
  quantity: z.number().int().min(1),
  supplierReference: z.string().trim().max(200).optional(),
  receivedDate: z.string().optional(),
  unitCost: z.number().min(0).optional(),
});

type IncomingFormValues = z.infer<typeof incomingSchema>;

interface StockIncomingDialogProps {
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

export function StockIncomingDialog({ open, onOpenChange, part }: StockIncomingDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IncomingFormValues>({
    resolver: zodResolver(incomingSchema),
    defaultValues: {
      quantity: 1,
      supplierReference: '',
      receivedDate: '',
      unitCost: undefined,
    },
  });

  const incomingMutation = useMutation({
    mutationFn: (values: IncomingFormValues) =>
      inventoryApi.recordIncoming({
        partId: part!.id,
        quantity: values.quantity,
        supplierReference: values.supplierReference?.trim() || undefined,
        receivedDate: values.receivedDate || undefined,
        unitCost: values.unitCost,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'low-stock'] });
      toast.success(t('storekeeperInventory.toasts.incomingSuccess'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('storekeeperInventory.toasts.incomingError')));
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        quantity: 1,
        supplierReference: '',
        receivedDate: '',
        unitCost: undefined,
      });
    }
  }, [open, reset, part?.id]);

  const onSubmit = (values: IncomingFormValues) => {
    if (!part) return;
    incomingMutation.mutate(values);
  };

  const currentUnitCost = Number(part?.unitCost ?? 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('storekeeperInventory.incoming.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('storekeeperInventory.incoming.dialogDescription', { name: part?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label={t('storekeeperInventory.incoming.quantity')}
            htmlFor="incoming-quantity"
            required
            error={errors.quantity ? t('storekeeperInventory.validation.incomingQuantity') : undefined}
          >
            <Input
              id="incoming-quantity"
              type="number"
              min={1}
              step={1}
              {...register('quantity', {
                setValueAs: (value) => (value === '' ? NaN : Number(value)),
              })}
            />
          </FormField>

          <FormField
            label={t('storekeeperInventory.incoming.supplierReference')}
            htmlFor="incoming-supplier-reference"
          >
            <Input
              id="incoming-supplier-reference"
              maxLength={200}
              {...register('supplierReference')}
            />
          </FormField>

          <FormField
            label={t('storekeeperInventory.incoming.receivedDate')}
            htmlFor="incoming-received-date"
          >
            <Input id="incoming-received-date" type="date" {...register('receivedDate')} />
          </FormField>

          <FormField
            label={t('storekeeperInventory.incoming.unitCost')}
            htmlFor="incoming-unit-cost"
            hint={t('storekeeperInventory.incoming.unitCostHint', { current: currentUnitCost })}
            error={errors.unitCost ? t('storekeeperInventory.validation.unitCost') : undefined}
          >
            <Input
              id="incoming-unit-cost"
              type="number"
              min={0}
              step={0.01}
              placeholder={part?.unitCost ?? undefined}
              {...register('unitCost', {
                setValueAs: (value) => (value === '' ? undefined : Number(value)),
              })}
            />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={incomingMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <SubmitButton
              isPending={incomingMutation.isPending}
              isSuccess={incomingMutation.isSuccess}
              disabled={!part}
            >
              {t('storekeeperInventory.actions.receiveStock')}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
