'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Check, X } from 'lucide-react';
import { PartRequestRejectionReason, PartRequestStatus } from '@gmao/shared';
import { partRequestsApi } from '@/lib/part-requests.api';
import type { PartRequestQueueItem } from '@/lib/part-requests.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaginationControls } from '@/components/ui/pagination-controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LIMIT = 20;

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadgeVariant(status: PartRequestStatus):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning' {
  if (status === PartRequestStatus.FULFILLED) return 'success';
  if (status === PartRequestStatus.PARTIALLY_FULFILLED) return 'warning';
  if (status === PartRequestStatus.REJECTED) return 'destructive';
  return 'secondary';
}

export function PartRequestsQueue() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PartRequestStatus | ''>('');

  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PartRequestQueueItem | null>(null);

  const [fulfillQuantity, setFulfillQuantity] = useState('');
  const [rejectReason, setRejectReason] = useState<PartRequestRejectionReason>(
    PartRequestRejectionReason.OUT_OF_STOCK,
  );
  const [rejectDetail, setRejectDetail] = useState('');

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [page, statusFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'part-requests', queryParams],
    queryFn: () => partRequestsApi.getQueue(queryParams),
  });

  const fulfillMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity?: number }) =>
      partRequestsApi.fulfill(id, quantity ? { quantity } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'part-requests'] });
      toast.success(t('storekeeperPartRequests.toasts.fulfillSuccess'));
      setFulfillDialogOpen(false);
      setSelectedRequest(null);
      setFulfillQuantity('');
    },
    onError: () => {
      toast.error(t('storekeeperPartRequests.toasts.fulfillError'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason, detail }: { id: string; reason: PartRequestRejectionReason; detail?: string }) =>
      partRequestsApi.reject(id, { reason, detail }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'part-requests'] });
      toast.success(t('storekeeperPartRequests.toasts.rejectSuccess'));
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK);
      setRejectDetail('');
    },
    onError: () => {
      toast.error(t('storekeeperPartRequests.toasts.rejectError'));
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const openFulfillDialog = (request: PartRequestQueueItem) => {
    setSelectedRequest(request);
    setFulfillQuantity(String(request.quantityRequested));
    setFulfillDialogOpen(true);
  };

  const openRejectDialog = (request: PartRequestQueueItem) => {
    setSelectedRequest(request);
    setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK);
    setRejectDetail('');
    setRejectDialogOpen(true);
  };

  const handleFulfill = () => {
    if (!selectedRequest) return;

    const parsed = parseInt(fulfillQuantity, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      toast.error(t('storekeeperPartRequests.toasts.invalidQuantity'));
      return;
    }

    fulfillMutation.mutate({
      id: selectedRequest.id,
      quantity: parsed,
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;

    rejectMutation.mutate({
      id: selectedRequest.id,
      reason: rejectReason,
      detail: rejectDetail.trim() ? rejectDetail.trim() : undefined,
    });
  };

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter((e.target.value as PartRequestStatus) || '');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('storekeeperPartRequests.filters.allStatuses')}</option>
            <option value={PartRequestStatus.PENDING}>
              {t('storekeeperPartRequests.status.PENDING')}
            </option>
            <option value={PartRequestStatus.FULFILLED}>
              {t('storekeeperPartRequests.status.FULFILLED')}
            </option>
            <option value={PartRequestStatus.PARTIALLY_FULFILLED}>
              {t('storekeeperPartRequests.status.PARTIALLY_FULFILLED')}
            </option>
            <option value={PartRequestStatus.REJECTED}>
              {t('storekeeperPartRequests.status.REJECTED')}
            </option>
          </select>
        </div>

        {data && (
          <span className="text-sm text-muted-foreground">
            {t('storekeeperPartRequests.total', { count: data.total })}
          </span>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('storekeeperPartRequests.columns.createdAt')}</TableHead>
              <TableHead>{t('storekeeperPartRequests.columns.workOrder')}</TableHead>
              <TableHead>{t('storekeeperPartRequests.columns.part')}</TableHead>
              <TableHead>{t('storekeeperPartRequests.columns.requester')}</TableHead>
              <TableHead>{t('storekeeperPartRequests.columns.quantity')}</TableHead>
              <TableHead>{t('storekeeperPartRequests.columns.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-destructive">
                  {t('storekeeperPartRequests.states.error')}
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('storekeeperPartRequests.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(request.createdAt)}
                  </TableCell>

                  <TableCell>
                    <p className="text-sm font-medium">{request.workOrder.referenceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {request.workOrder.asset?.name ?? t('storekeeperPartRequests.labels.noAsset')}
                    </p>
                  </TableCell>

                  <TableCell>
                    {request.part ? (
                      <>
                        <p className="text-sm font-medium">{request.part.name}</p>
                        <p className="text-xs text-muted-foreground">{request.part.referenceCode}</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {request.offCatalogDescription ?? t('storekeeperPartRequests.labels.offCatalogUnknown')}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="text-sm">{request.requester.name}</TableCell>

                  <TableCell>
                    <p className="text-sm">
                      {t('storekeeperPartRequests.labels.quantityRequested', {
                        value: request.quantityRequested,
                      })}
                    </p>
                    {request.status !== PartRequestStatus.PENDING && (
                      <p className="text-xs text-muted-foreground">
                        {t('storekeeperPartRequests.labels.quantityFulfilled', {
                          value: request.quantityFulfilled,
                        })}
                      </p>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(request.status)}>
                      {t(`storekeeperPartRequests.status.${request.status}`)}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {request.status === PartRequestStatus.PENDING && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('storekeeperPartRequests.actions.fulfill')}
                            onClick={() => openFulfillDialog(request)}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('storekeeperPartRequests.actions.reject')}
                            onClick={() => openRejectDialog(request)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />

      <Dialog
        open={fulfillDialogOpen}
        onOpenChange={(open) => {
          setFulfillDialogOpen(open);
          if (!open) {
            setSelectedRequest(null);
            setFulfillQuantity('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('storekeeperPartRequests.fulfillDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('storekeeperPartRequests.fulfillDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="fulfill-quantity">{t('storekeeperPartRequests.fulfillDialog.quantity')}</Label>
            <Input
              id="fulfill-quantity"
              type="number"
              min={1}
              value={fulfillQuantity}
              onChange={(e) => setFulfillQuantity(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFulfillDialogOpen(false)}
              disabled={fulfillMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={handleFulfill} disabled={fulfillMutation.isPending}>
              {fulfillMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('storekeeperPartRequests.actions.fulfill')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          setRejectDialogOpen(open);
          if (!open) {
            setSelectedRequest(null);
            setRejectReason(PartRequestRejectionReason.OUT_OF_STOCK);
            setRejectDetail('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('storekeeperPartRequests.rejectDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('storekeeperPartRequests.rejectDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t('storekeeperPartRequests.rejectDialog.reason')}</Label>
            <select
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value as PartRequestRejectionReason)}
              className={selectClass}
            >
              <option value={PartRequestRejectionReason.OUT_OF_STOCK}>
                {t('storekeeperPartRequests.rejectionReason.OUT_OF_STOCK')}
              </option>
              <option value={PartRequestRejectionReason.NOT_APPLICABLE}>
                {t('storekeeperPartRequests.rejectionReason.NOT_APPLICABLE')}
              </option>
              <option value={PartRequestRejectionReason.INCORRECT_REQUEST}>
                {t('storekeeperPartRequests.rejectionReason.INCORRECT_REQUEST')}
              </option>
              <option value={PartRequestRejectionReason.OTHER}>
                {t('storekeeperPartRequests.rejectionReason.OTHER')}
              </option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reject-detail">{t('storekeeperPartRequests.rejectDialog.detail')}</Label>
            <Input
              id="reject-detail"
              value={rejectDetail}
              onChange={(e) => setRejectDetail(e.target.value)}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('storekeeperPartRequests.actions.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
