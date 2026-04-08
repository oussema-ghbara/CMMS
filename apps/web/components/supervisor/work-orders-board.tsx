'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Pencil, Search } from 'lucide-react';
import { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@gmao/shared';
import { workOrdersApi, type WorkOrderListItem } from '@/lib/work-orders.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LIMIT = 20;

const STATUS_OPTIONS = [
  WorkOrderStatus.DRAFT,
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.CANCELLED,
] as const;

const TYPE_OPTIONS = [WorkOrderType.CORRECTIVE, WorkOrderType.PREVENTIVE] as const;

const PRIORITY_OPTIONS = [
  WorkOrderPriority.CRITICAL,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.LOW,
] as const;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getStatusBadgeVariant(status: WorkOrderStatus):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning' {
  if (status === WorkOrderStatus.CLOSED) return 'success';
  if (status === WorkOrderStatus.CANCELLED) return 'destructive';
  if (status === WorkOrderStatus.IN_PROGRESS || status === WorkOrderStatus.PENDING_VALIDATION) return 'warning';
  if (status === WorkOrderStatus.ON_HOLD) return 'outline';
  return 'secondary';
}

function getPriorityBadgeVariant(priority: WorkOrderPriority):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning' {
  if (priority === WorkOrderPriority.CRITICAL) return 'destructive';
  if (priority === WorkOrderPriority.HIGH) return 'warning';
  if (priority === WorkOrderPriority.MEDIUM) return 'secondary';
  return 'outline';
}

function getPrincipalName(item: WorkOrderListItem, fallback: string): string {
  if (item.principalTechnician?.name) return item.principalTechnician.name;
  const principal = item.assignments.find((assignment) => assignment.isPrincipal);
  return principal?.technician.name ?? fallback;
}

export function WorkOrdersBoard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const [type, setType] = useState<WorkOrderType | ''>('');
  const [priority, setPriority] = useState<WorkOrderPriority | ''>('');

  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderListItem | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [newPriority, setNewPriority] = useState<WorkOrderPriority>(WorkOrderPriority.MEDIUM);

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
    }),
    [page, search, status, type, priority],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'work-orders', queryParams],
    queryFn: () => workOrdersApi.list(queryParams),
  });

  const priorityMutation = useMutation({
    mutationFn: ({ id, priority: priorityValue }: { id: string; priority: WorkOrderPriority }) =>
      workOrdersApi.changePriority(id, { priority: priorityValue }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'work-orders'] });
      toast.success(t('supervisorWorkOrders.toasts.priorityUpdateSuccess'));
      setPriorityDialogOpen(false);
      setSelectedWorkOrder(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorWorkOrders.toasts.priorityUpdateError')));
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const handleApplyFilters = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setType('');
    setPriority('');
    setPage(1);
  };

  const openPriorityDialog = (item: WorkOrderListItem) => {
    setSelectedWorkOrder(item);
    setNewPriority(item.priority);
    setPriorityDialogOpen(true);
  };

  const submitPriorityUpdate = () => {
    if (!selectedWorkOrder) return;
    priorityMutation.mutate({ id: selectedWorkOrder.id, priority: newPriority });
  };

  const selectClass =
    'h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('supervisorWorkOrders.filters.searchPlaceholder')}
              className="w-[300px] pl-8"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleApplyFilters();
                }
              }}
            />
          </div>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as WorkOrderStatus | '');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('supervisorWorkOrders.filters.allStatuses')}</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`supervisorWorkOrders.status.${option}`)}
              </option>
            ))}
          </select>

          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as WorkOrderType | '');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('supervisorWorkOrders.filters.allTypes')}</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`supervisorWorkOrders.types.${option}`)}
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value as WorkOrderPriority | '');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('supervisorWorkOrders.filters.allPriorities')}</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`supervisorWorkOrders.priority.${option}`)}
              </option>
            ))}
          </select>

          <Button type="button" variant="outline" onClick={handleApplyFilters}>
            {t('supervisorWorkOrders.filters.apply')}
          </Button>

          <Button type="button" variant="ghost" onClick={handleResetFilters}>
            {t('supervisorWorkOrders.filters.reset')}
          </Button>
        </div>

        {data && (
          <span className="text-sm text-muted-foreground">
            {t('supervisorWorkOrders.total', { count: data.total })}
          </span>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('supervisorWorkOrders.columns.createdAt')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.reference')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.asset')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.technician')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.type')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.priority')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.status')}</TableHead>
              <TableHead>{t('supervisorWorkOrders.columns.dueDate')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-destructive">
                  {t('supervisorWorkOrders.states.error')}
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  {t('supervisorWorkOrders.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((item) => {
                const isTerminal =
                  item.status === WorkOrderStatus.CLOSED || item.status === WorkOrderStatus.CANCELLED;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{item.referenceNumber}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{item.asset?.name ?? t('common.noData')}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.asset?.location?.fullPath ?? t('common.noData')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {getPrincipalName(item, t('supervisorWorkOrders.labels.unassigned'))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(`supervisorWorkOrders.types.${item.type}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPriorityBadgeVariant(item.priority)}>
                        {t(`supervisorWorkOrders.priority.${item.priority}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(item.status)}>
                        {t(`supervisorWorkOrders.status.${item.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(item.dueDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={t('supervisorWorkOrders.actions.changePriority')}
                          disabled={isTerminal}
                          onClick={() => openPriorityDialog(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((current) => current - 1)}
        onNext={() => setPage((current) => current + 1)}
      />

      <Dialog
        open={priorityDialogOpen}
        onOpenChange={(open) => {
          setPriorityDialogOpen(open);
          if (!open) {
            setSelectedWorkOrder(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('supervisorWorkOrders.dialog.title')}</DialogTitle>
            <DialogDescription>
              {selectedWorkOrder
                ? t('supervisorWorkOrders.dialog.description', {
                    reference: selectedWorkOrder.referenceNumber,
                  })
                : t('supervisorWorkOrders.dialog.descriptionEmpty')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="wo-priority">{t('supervisorWorkOrders.dialog.priorityLabel')}</Label>
            <select
              id="wo-priority"
              value={newPriority}
              onChange={(event) => setNewPriority(event.target.value as WorkOrderPriority)}
              className={selectClass}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`supervisorWorkOrders.priority.${option}`)}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPriorityDialogOpen(false)}
              disabled={priorityMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={submitPriorityUpdate} disabled={priorityMutation.isPending}>
              {priorityMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
