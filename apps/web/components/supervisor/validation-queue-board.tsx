'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, Eye, Loader2 } from 'lucide-react';
import { WorkOrderStatus, WorkOrderPriority, WorkOrderType } from '@gmao/shared';
import { workOrdersApi, type WorkOrderListItem } from '@/lib/work-orders.api';
import { useAuthStore } from '@/store/auth.store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WorkOrderDetailDialog } from './work-order-detail-dialog';
import { elapsedSince } from '@/lib/date-utils';

const LIMIT = 20;

function getPriorityBadgeVariant(
  priority: WorkOrderPriority,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (priority === WorkOrderPriority.CRITICAL) return 'destructive';
  if (priority === WorkOrderPriority.HIGH) return 'warning';
  if (priority === WorkOrderPriority.MEDIUM) return 'secondary';
  return 'outline';
}

function getTypeBadgeVariant(
  type: WorkOrderType,
): 'default' | 'secondary' | 'outline' {
  return type === WorkOrderType.PREVENTIVE ? 'outline' : 'secondary';
}

function getPrincipalName(item: WorkOrderListItem, fallback: string): string {
  if (item.principalTechnician?.name) return item.principalTechnician.name;
  const principal = item.assignments.find((a) => a.isPrincipal);
  return principal?.technician.name ?? fallback;
}

export function ValidationQueueBoard() {
  const { t } = useTranslation();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [page, setPage] = useState(1);
  const [detailWorkOrder, setDetailWorkOrder] = useState<WorkOrderListItem | { id: string } | null>(
    null,
  );
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const queryParams = { page, limit: LIMIT, status: WorkOrderStatus.PENDING_VALIDATION };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'validation-queue', queryParams],
    queryFn: () => workOrdersApi.list(queryParams),
    enabled: isInitialized,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  function openDetail(wo: WorkOrderListItem) {
    setDetailWorkOrder(wo);
    setDetailDialogOpen(true);
  }

  return (
    <>
      <div className="space-y-4">
        {/* Count */}
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? t('common.loading')
            : t('validationQueue.total', { count: data?.total ?? 0 })}
        </p>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t('common.loading')}</span>
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {t('validationQueue.states.error')}
          </p>
        ) : !data?.data.length ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            {t('validationQueue.states.empty')}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('validationQueue.columns.reference')}</TableHead>
                  <TableHead>{t('validationQueue.columns.asset')}</TableHead>
                  <TableHead>{t('validationQueue.columns.technician')}</TableHead>
                  <TableHead>{t('validationQueue.columns.type')}</TableHead>
                  <TableHead>{t('validationQueue.columns.priority')}</TableHead>
                  <TableHead>{t('validationQueue.columns.inQueueSince')}</TableHead>
                  <TableHead className="text-right">
                    {t('validationQueue.columns.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {wo.referenceNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{wo.asset.name}</span>
                        {wo.asset.location?.fullPath && (
                          <span className="text-xs text-muted-foreground">
                            {wo.asset.location.fullPath}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getPrincipalName(wo, t('supervisorWorkOrders.labels.unassigned'))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTypeBadgeVariant(wo.type)}>
                        {t(`supervisorWorkOrders.types.${wo.type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPriorityBadgeVariant(wo.priority)}>
                        {t(`supervisorWorkOrders.priority.${wo.priority}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {elapsedSince(wo.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetail(wo)}
                        aria-label={t('supervisorWorkOrders.actions.view')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {t('common.pagination', { page, totalPages })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('common.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog — reuses the same supervisor detail dialog */}
      {detailWorkOrder && (
        <WorkOrderDetailDialog
          workOrder={detailWorkOrder}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
        />
      )}
    </>
  );
}
