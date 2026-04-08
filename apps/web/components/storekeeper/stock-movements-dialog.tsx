'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { StockMovementType } from '@gmao/shared';
import { inventoryApi, type PartCatalogItem, type StockMovement } from '@/lib/inventory.api';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface StockMovementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartCatalogItem | null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getTypeBadgeVariant(
  type: StockMovementType,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (type === StockMovementType.INCOMING) return 'success';
  if (type === StockMovementType.OUTGOING) return 'secondary';
  if (type === StockMovementType.ADJUSTMENT) return 'warning';
  return 'outline';
}

function formatSignedQuantity(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '0';
}

function MovementRow({ movement }: { movement: StockMovement }) {
  const { t } = useTranslation();

  const quantityClass = movement.quantity >= 0 ? 'text-green-700' : 'text-destructive';

  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={getTypeBadgeVariant(movement.type)}>
              {t(`storekeeperInventory.movements.types.${movement.type}`)}
            </Badge>
            <span className={`text-sm font-medium ${quantityClass}`}>
              {formatSignedQuantity(movement.quantity)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('storekeeperInventory.movements.balanceAfter', { value: movement.balanceAfter })}
            </span>
          </div>

          {movement.reason && <p className="text-sm text-muted-foreground">{movement.reason}</p>}
          {!movement.reason && movement.referenceId && (
            <p className="text-sm text-muted-foreground">{movement.referenceId}</p>
          )}
        </div>

        <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
          <p>{movement.actor?.name ?? '—'}</p>
          <p>{formatDateTime(movement.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

export function StockMovementsDialog({ open, onOpenChange, part }: StockMovementsDialogProps) {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'movements', part?.id],
    queryFn: () => inventoryApi.getMovements(part!.id),
    enabled: open && !!part,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('storekeeperInventory.movements.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('storekeeperInventory.movements.dialogDescription', { name: part?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="py-4 text-center text-sm text-destructive">
              {t('storekeeperInventory.movements.error')}
            </p>
          ) : !data || data.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('storekeeperInventory.movements.empty')}
            </p>
          ) : (
            data.map((movement) => <MovementRow key={movement.id} movement={movement} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
