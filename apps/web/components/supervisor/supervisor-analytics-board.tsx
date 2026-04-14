'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { WorkOrderStatus, WorkOrderType, WorkOrderPriority } from '@gmao/shared';
import { workOrdersApi } from '@/lib/work-orders.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const DEFAULT_PERIOD_DAYS = 30;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value * 100)} %`;
}

function formatDays(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
}

const STATUS_ORDER: WorkOrderStatus[] = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.PENDING_VALIDATION,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.CANCELLED,
  WorkOrderStatus.DRAFT,
];

const PRIORITY_ORDER: WorkOrderPriority[] = [
  WorkOrderPriority.CRITICAL,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.LOW,
];

function getStatusBadgeVariant(
  status: WorkOrderStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (status === WorkOrderStatus.CLOSED) return 'success';
  if (status === WorkOrderStatus.CANCELLED) return 'destructive';
  if (status === WorkOrderStatus.IN_PROGRESS || status === WorkOrderStatus.PENDING_VALIDATION)
    return 'warning';
  if (status === WorkOrderStatus.ON_HOLD) return 'outline';
  return 'secondary';
}

function getPriorityBadgeVariant(
  priority: WorkOrderPriority,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (priority === WorkOrderPriority.CRITICAL) return 'destructive';
  if (priority === WorkOrderPriority.HIGH) return 'warning';
  if (priority === WorkOrderPriority.MEDIUM) return 'secondary';
  return 'outline';
}

export function SupervisorAnalyticsBoard() {
  const { t } = useTranslation();

  const [periodInput, setPeriodInput] = useState(String(DEFAULT_PERIOD_DAYS));
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);

  const queryParams = useMemo(() => ({ periodDays }), [periodDays]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'analytics', queryParams],
    queryFn: () => workOrdersApi.getAnalytics(queryParams),
  });

  const handleApply = () => {
    const parsed = Math.max(1, Number.parseInt(periodInput, 10) || DEFAULT_PERIOD_DAYS);
    setPeriodInput(String(parsed));
    setPeriodDays(parsed);
  };

  const handleReset = () => {
    setPeriodInput(String(DEFAULT_PERIOD_DAYS));
    setPeriodDays(DEFAULT_PERIOD_DAYS);
  };

  const summary = data?.summary;
  const byStatus = data?.byStatus ?? {};
  const byType = data?.byType ?? {};
  const byPriority = data?.byPriority ?? {};

  const statusEntries = STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0).map((s) => ({
    status: s,
    count: byStatus[s] ?? 0,
  }));

  const priorityEntries = PRIORITY_ORDER.filter((p) => (byPriority[p] ?? 0) > 0).map((p) => ({
    priority: p,
    count: byPriority[p] ?? 0,
  }));

  const correctiveCount = byType[WorkOrderType.CORRECTIVE] ?? 0;
  const preventiveCount = byType[WorkOrderType.PREVENTIVE] ?? 0;
  const typeTotal = correctiveCount + preventiveCount;

  return (
    <div className="space-y-6">
      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="analytics-period-days">
            {t('supervisorAnalytics.filters.periodDays')}
          </label>
          <Input
            id="analytics-period-days"
            type="number"
            min={1}
            max={365}
            value={periodInput}
            onChange={(e) => setPeriodInput(e.target.value)}
            className="w-20 h-8 text-sm"
          />
        </div>
        <Button size="sm" variant="outline" onClick={handleApply}>
          {t('supervisorAnalytics.filters.apply')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReset}>
          {t('supervisorAnalytics.filters.reset')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('supervisorAnalytics.states.error')}
        </div>
      ) : data ? (
        <>
          {/* ── KPI cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('supervisorAnalytics.kpi.totalWorkOrders')}</CardDescription>
                <CardTitle className="text-3xl">{formatNumber(summary?.total ?? 0)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {t('supervisorAnalytics.kpi.openWorkOrders', { count: summary?.open ?? 0 })}
                </p>
              </CardContent>
            </Card>

            <Card className={summary?.overdue ? 'border-destructive/50' : ''}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  {t('supervisorAnalytics.kpi.overdueWorkOrders')}
                </CardDescription>
                <CardTitle className={`text-3xl ${summary?.overdue ? 'text-destructive' : ''}`}>
                  {formatNumber(summary?.overdue ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {t('supervisorAnalytics.kpi.overdueDescription')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  {t('supervisorAnalytics.kpi.closedThisPeriod')}
                </CardDescription>
                <CardTitle className="text-3xl">
                  {formatNumber(summary?.closedThisPeriod ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {t('supervisorAnalytics.kpi.periodDaysLabel', { days: periodDays })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {t('supervisorAnalytics.kpi.resolutionRate')}
                </CardDescription>
                <CardTitle className="text-3xl">
                  {summary?.resolutionRate !== null && summary?.resolutionRate !== undefined
                    ? formatPercent(summary.resolutionRate)
                    : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {data.avgResolutionDays !== null
                    ? t('supervisorAnalytics.kpi.avgResolutionDays', {
                        days: formatDays(data.avgResolutionDays),
                      })
                    : t('supervisorAnalytics.kpi.noClosedYet')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── By status + by type ── */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* By status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t('supervisorAnalytics.sections.byStatus')}
                </CardTitle>
                <CardDescription>
                  {t('supervisorAnalytics.sections.byStatusDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statusEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('supervisorAnalytics.states.empty')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {statusEntries.map(({ status, count }) => (
                      <div key={status} className="flex items-center justify-between gap-2">
                        <Badge variant={getStatusBadgeVariant(status)}>
                          {t(`supervisorWorkOrders.status.${status}`)}
                        </Badge>
                        <span className="text-sm font-medium tabular-nums">
                          {formatNumber(count)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t('supervisorAnalytics.sections.byType')}
                </CardTitle>
                <CardDescription>
                  {t('supervisorAnalytics.sections.byTypeDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {typeTotal === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('supervisorAnalytics.states.empty')}
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('supervisorAnalytics.type.CORRECTIVE')}</span>
                        <span className="font-medium tabular-nums">
                          {formatNumber(correctiveCount)}
                          {typeTotal > 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({formatPercent(correctiveCount / typeTotal)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: typeTotal > 0 ? `${(correctiveCount / typeTotal) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('supervisorAnalytics.type.PREVENTIVE')}</span>
                        <span className="font-medium tabular-nums">
                          {formatNumber(preventiveCount)}
                          {typeTotal > 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({formatPercent(preventiveCount / typeTotal)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: typeTotal > 0 ? `${(preventiveCount / typeTotal) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── By priority (active WOs only) ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('supervisorAnalytics.sections.byPriority')}
              </CardTitle>
              <CardDescription>
                {t('supervisorAnalytics.sections.byPriorityDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {priorityEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('supervisorAnalytics.states.noActiveWorkOrders')}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {priorityEntries.map(({ priority, count }) => (
                    <div
                      key={priority}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <Badge variant={getPriorityBadgeVariant(priority)}>
                        {t(`supervisorWorkOrders.priority.${priority}`)}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatNumber(count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Period summary ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('supervisorAnalytics.sections.periodSummary')}
              </CardTitle>
              <CardDescription>
                {t('supervisorAnalytics.sections.periodSummaryDescription', { days: periodDays })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-md border px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatNumber(summary?.closedThisPeriod ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('supervisorAnalytics.period.closed')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-md border px-4 py-3">
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatNumber(summary?.cancelledThisPeriod ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('supervisorAnalytics.period.cancelled')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-md border px-4 py-3">
                  <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data.avgResolutionDays !== null
                        ? `${formatDays(data.avgResolutionDays)}j`
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('supervisorAnalytics.period.avgResolution')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
