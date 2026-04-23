'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Eye, Loader2, List, PauseCircle, Pencil, PlayCircle, Plus, Search, User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { assetsApi } from '@/lib/assets.api';
import { preventivePlansApi, type PreventivePlanItem, type CalendarPreviewItem } from '@/lib/preventive-plans.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PreventivePlanDetailDialog } from './preventive-plan-detail-dialog';
import { PreventivePlanFormDialog } from './preventive-plan-form-dialog';

const LIMIT = 20;

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

export function PreventivePlansBoard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [assetFilterId, setAssetFilterId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PreventivePlanItem | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(assetFilterId ? { assetId: assetFilterId } : {}),
      ...(statusFilter === 'active' ? { isActive: true } : {}),
      ...(statusFilter === 'inactive' ? { isActive: false } : {}),
    }),
    [assetFilterId, page, statusFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'preventive-plans', queryParams],
    queryFn: () => preventivePlansApi.list(queryParams),
  });

  const assetPickerQuery = useQuery({
    queryKey: ['supervisor', 'preventive-plans', 'asset-picker', assetSearch],
    queryFn: () => assetsApi.list({ page: 1, limit: 20, ...(assetSearch.trim() ? { search: assetSearch.trim() } : {}) }),
  });

  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['supervisor', 'preventive-plans', 'calendar'],
    queryFn: () => preventivePlansApi.getCalendar(),
    enabled: activeView === 'calendar',
  });

  const calendarByDate = useMemo(() => {
    if (!calendarData) return new Map<string, CalendarPreviewItem[]>();
    const map = new Map<string, CalendarPreviewItem[]>();
    for (const item of calendarData) {
      const day = item.generationDate.slice(0, 10);
      const existing = map.get(day) ?? [];
      existing.push(item);
      map.set(day, existing);
    }
    return map;
  }, [calendarData]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const selectedPlan = data?.data.find((plan) => plan.id === selectedPlanId) ?? null;

  const activateMutation = useMutation({
    mutationFn: (planId: string) => preventivePlansApi.activate(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.activateSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.activateError')),
  });

  const deactivateMutation = useMutation({
    mutationFn: (planId: string) => preventivePlansApi.deactivate(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(t('supervisorPreventivePlans.toasts.deactivateSuccess'));
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.deactivateError')),
  });

  const triggerMutation = useMutation({
    mutationFn: (planId: string) => preventivePlansApi.triggerNow(planId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'preventive-plans'] });
      toast.success(
        data.jobId
          ? t('supervisorPreventivePlans.toasts.triggerSuccessWithJob', { jobId: data.jobId })
          : t('supervisorPreventivePlans.toasts.triggerSuccess'),
      );
    },
    onError: () => toast.error(t('supervisorPreventivePlans.toasts.triggerError')),
  });

  const openCreateDialog = () => {
    setEditingPlan(null);
    setPlanDialogOpen(true);
  };

  const openEditDialog = (plan: PreventivePlanItem) => {
    setEditingPlan(plan);
    setPlanDialogOpen(true);
  };

  const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder={t('supervisorPreventivePlans.filters.assetSearchPlaceholder')}
              className="w-[280px] pl-8"
            />
          </div>

          <select
            className={selectClass}
            value={assetFilterId}
            onChange={(event) => setAssetFilterId(event.target.value)}
          >
            <option value="">{t('supervisorPreventivePlans.filters.allAssets')}</option>
            {(assetPickerQuery.data?.data ?? []).map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} · {asset.location.fullPath}
              </option>
            ))}
          </select>

          <select
            className={selectClass}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            <option value="">{t('supervisorPreventivePlans.filters.allStatuses')}</option>
            <option value="active">{t('supervisorPreventivePlans.filters.active')}</option>
            <option value="inactive">{t('supervisorPreventivePlans.filters.inactive')}</option>
          </select>

          <Button type="button" variant="ghost" onClick={() => {
            setAssetSearch('');
            setAssetFilterId('');
            setStatusFilter('');
            setPage(1);
          }}>
            {t('supervisorPreventivePlans.filters.reset')}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-input overflow-hidden">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                activeView === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
              onClick={() => setActiveView('list')}
            >
              <List className="h-3.5 w-3.5" />
              {t('supervisorPreventivePlans.views.list')}
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                activeView === 'calendar'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
              onClick={() => setActiveView('calendar')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {t('supervisorPreventivePlans.views.calendar')}
            </button>
          </div>
          <Button type="button" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            {t('supervisorPreventivePlans.actions.create')}
          </Button>
        </div>
      </div>

      {activeView === 'list' && data && (
        <div className="text-sm text-muted-foreground">
          {t('supervisorPreventivePlans.total', { count: data.total })}
        </div>
      )}

      {activeView === 'list' && (
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('supervisorPreventivePlans.columns.title')}</TableHead>
              <TableHead>{t('supervisorPreventivePlans.columns.asset')}</TableHead>
              <TableHead>{t('supervisorPreventivePlans.columns.frequency')}</TableHead>
              <TableHead>{t('supervisorPreventivePlans.columns.nextDueAt')}</TableHead>
              <TableHead>{t('supervisorPreventivePlans.columns.defaultTechnician')}</TableHead>
              <TableHead>{t('supervisorPreventivePlans.columns.status')}</TableHead>
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
                  {t('supervisorPreventivePlans.states.error')}
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('supervisorPreventivePlans.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{plan.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{plan.description ?? t('common.noData')}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{plan.asset.name}</p>
                      <p className="text-xs text-muted-foreground">{plan.asset.location?.fullPath ?? '—'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="secondary">{t(`supervisorPreventivePlans.frequencyType.${plan.frequencyType}`)}</Badge>
                      <p className="text-xs text-muted-foreground">
                        {plan.frequencyType === 'FIXED_INTERVAL_DAYS'
                          ? t('supervisorPreventivePlans.labels.intervalDays', { count: plan.intervalDays ?? 0 })
                          : plan.calendarExpression ?? '—'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(plan.nextDueAt)}</TableCell>
                  <TableCell className="text-sm">{plan.defaultTechnician?.name ?? t('supervisorPreventivePlans.labels.unassigned')}</TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? 'success' : 'destructive'}>
                      {plan.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" title={t('supervisorPreventivePlans.actions.view')} onClick={() => setSelectedPlanId(plan.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" title={t('common.edit')} onClick={() => openEditDialog(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={plan.isActive ? t('supervisorPreventivePlans.actions.deactivate') : t('supervisorPreventivePlans.actions.activate')}
                        onClick={() => (plan.isActive ? deactivateMutation.mutate(plan.id) : activateMutation.mutate(plan.id))}
                        disabled={activateMutation.isPending || deactivateMutation.isPending}
                      >
                        {plan.isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('supervisorPreventivePlans.actions.triggerNow')}
                        onClick={() => triggerMutation.mutate(plan.id)}
                        disabled={triggerMutation.isPending || !plan.isActive}
                      >
                        <PlayCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {activeView === 'list' && (
      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((current) => current - 1)}
        onNext={() => setPage((current) => current + 1)}
      />
      )}

      {activeView === 'calendar' && (
        <div className="space-y-4">
          {calendarLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !calendarData || calendarData.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border text-sm text-muted-foreground">
              {t('supervisorPreventivePlans.calendar.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('supervisorPreventivePlans.calendar.total', { count: calendarData.length })}
              </p>
              {[...calendarByDate.entries()].map(([day, items]) => (
                <div key={day} className="rounded-md border bg-card overflow-hidden">
                  <div className="bg-muted/40 border-b px-4 py-2 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {new Intl.DateTimeFormat('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }).format(new Date(day))}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {t('supervisorPreventivePlans.calendar.itemCount', { count: items.length })}
                    </span>
                  </div>
                  <ul className="divide-y">
                    {items.map((item, index) => (
                      <li
                        key={`${item.planId}-${index}`}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.planTitle}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.assetName}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {item.estimatedDurationMinutes && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {item.estimatedDurationMinutes}min
                            </span>
                          )}
                          {item.defaultTechnicianName ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {item.defaultTechnicianName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('supervisorPreventivePlans.labels.unassigned')}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PreventivePlanFormDialog
        open={planDialogOpen}
        onOpenChange={(open) => {
          setPlanDialogOpen(open);
          if (!open) setEditingPlan(null);
        }}
        plan={editingPlan}
        onSuccess={() => {
          setPlanDialogOpen(false);
          setEditingPlan(null);
        }}
      />

      <PreventivePlanDetailDialog
        open={!!selectedPlan}
        onOpenChange={(open) => {
          if (!open) setSelectedPlanId(null);
        }}
        plan={selectedPlan}
        onEditPlan={(plan) => {
          setSelectedPlanId(null);
          openEditDialog(plan);
        }}
      />
    </div>
  );
}