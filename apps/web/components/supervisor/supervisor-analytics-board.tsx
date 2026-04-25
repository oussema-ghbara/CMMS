'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart2, ClipboardCheck, Loader2,
  TrendingDown, TrendingUp, Users, Wrench,
} from 'lucide-react';
import { WorkOrderStatus, WorkOrderType, WorkOrderPriority } from '@gmao/shared';
import { workOrdersApi, type TechnicianKpiItem } from '@/lib/work-orders.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const DEFAULT_PERIOD_DAYS = 30;

type AnalyticsTab = 'overview' | 'assets' | 'technicians' | 'preventive' | 'requester' | 'operational';

function fmt(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}
function fmtPct(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value * 100)} %`;
}
function fmtDec(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
}
function fmtCur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

const STATUS_ORDER: WorkOrderStatus[] = [
  WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD, WorkOrderStatus.PENDING_VALIDATION,
  WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED, WorkOrderStatus.DRAFT,
];
const PRIORITY_ORDER: WorkOrderPriority[] = [
  WorkOrderPriority.CRITICAL, WorkOrderPriority.HIGH, WorkOrderPriority.MEDIUM, WorkOrderPriority.LOW,
];

function statusVariant(s: WorkOrderStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (s === WorkOrderStatus.CLOSED) return 'success';
  if (s === WorkOrderStatus.CANCELLED) return 'destructive';
  if (s === WorkOrderStatus.IN_PROGRESS || s === WorkOrderStatus.PENDING_VALIDATION) return 'warning';
  if (s === WorkOrderStatus.ON_HOLD) return 'outline';
  return 'secondary';
}
function priorityVariant(p: WorkOrderPriority): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (p === WorkOrderPriority.CRITICAL) return 'destructive';
  if (p === WorkOrderPriority.HIGH) return 'warning';
  if (p === WorkOrderPriority.MEDIUM) return 'secondary';
  return 'outline';
}

function KpiCard({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl">{value ?? '—'}</CardTitle>
      </CardHeader>
      {sub && <CardContent><p className="text-xs text-muted-foreground">{sub}</p></CardContent>}
    </Card>
  );
}

function TechRow({ item }: { item: TechnicianKpiItem }) {
  const { t } = useTranslation();
  const hasRejections = item.rejectionCount > 0;
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="py-2 pr-4 text-sm font-medium">{item.name}</td>
        <td className="py-2 pr-4 text-sm text-center">{item.closedCount}</td>
        <td className="py-2 pr-4 text-sm text-center">{item.firstPassRate !== null ? fmtPct(item.firstPassRate) : '—'}</td>
        <td className="py-2 pr-4 text-sm text-center">
          {item.rejectionRate !== null ? (
            <span className={item.rejectionRate > 0 ? 'text-destructive font-medium' : ''}>
              {fmtPct(item.rejectionRate)}
            </span>
          ) : '—'}
        </td>
        <td className="py-2 pr-4 text-sm text-center">{item.avgActiveDurationMinutes !== null ? `${fmtDec(item.avgActiveDurationMinutes)} min` : '—'}</td>
        <td className="py-2 pr-4 text-sm text-center">{item.avgResponseTimeHours !== null ? `${fmtDec(item.avgResponseTimeHours)} h` : '—'}</td>
        <td className="py-2 text-sm text-center">{item.avgHoldPerWo !== null ? fmtDec(item.avgHoldPerWo) : '—'}</td>
      </tr>
      {hasRejections && (
        <tr className="border-b last:border-0 bg-muted/30">
          <td colSpan={7} className="pb-2 pt-0 pl-4 pr-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(item.rejectionRateByCategory).map(([reason, entry]) => (
                <span key={reason} className="inline-flex items-center gap-1 text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
                  <span>{t(`validationRejectionReason.${reason}`, { defaultValue: reason })}</span>
                  <span className="font-semibold">×{entry.count}</span>
                  <span className="opacity-70">({fmtPct(entry.rate)})</span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function SupervisorAnalyticsBoard() {
  const { t } = useTranslation();

  const [periodInput, setPeriodInput] = useState(String(DEFAULT_PERIOD_DAYS));
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

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

  const summary = data?.summary;
  const byStatus = data?.byStatus ?? {};
  const byType = data?.byType ?? {};
  const byPriority = data?.byPriority ?? {};

  const statusEntries = STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0).map((s) => ({ status: s, count: byStatus[s] ?? 0 }));
  const priorityEntries = PRIORITY_ORDER.filter((p) => (byPriority[p] ?? 0) > 0).map((p) => ({ priority: p, count: byPriority[p] ?? 0 }));
  const correctiveCount = byType[WorkOrderType.CORRECTIVE] ?? 0;
  const preventiveCount = byType[WorkOrderType.PREVENTIVE] ?? 0;

  const TABS: { key: AnalyticsTab; Icon: typeof BarChart2; labelKey: string }[] = [
    { key: 'overview', Icon: BarChart2, labelKey: 'supervisorAnalytics.tabs.overview' },
    { key: 'assets', Icon: Wrench, labelKey: 'supervisorAnalytics.tabs.assets' },
    { key: 'technicians', Icon: Users, labelKey: 'supervisorAnalytics.tabs.technicians' },
    { key: 'preventive', Icon: ClipboardCheck, labelKey: 'supervisorAnalytics.tabs.preventive' },
    { key: 'requester', Icon: TrendingUp, labelKey: 'supervisorAnalytics.tabs.requester' },
    { key: 'operational', Icon: TrendingDown, labelKey: 'supervisorAnalytics.tabs.operational' },
  ];

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
        <Button size="sm" variant="ghost" onClick={() => { setPeriodInput(String(DEFAULT_PERIOD_DAYS)); setPeriodDays(DEFAULT_PERIOD_DAYS); }}>
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
        <div className="space-y-4">
          {/* ── Tab bar ── */}
          <div className="flex flex-wrap gap-1 border-b pb-3">
            {TABS.map(({ key, Icon, labelKey }) => (
              <Button
                key={key}
                size="sm"
                variant={activeTab === key ? 'default' : 'ghost'}
                onClick={() => setActiveTab(key)}
                className="gap-1"
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Button>
            ))}
          </div>

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label={t('supervisorAnalytics.kpi.totalWorkOrders')}
                  value={fmt(summary?.total ?? 0)}
                  sub={t('supervisorAnalytics.kpi.openWorkOrders', { count: summary?.open ?? 0 })}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.overdueWorkOrders')}
                  value={fmt(summary?.overdue ?? 0)}
                  sub={t('supervisorAnalytics.kpi.overdueDescription')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.resolutionRate')}
                  value={summary?.resolutionRate != null ? fmtPct(summary.resolutionRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.closedThisPeriod', { count: summary?.closedThisPeriod ?? 0 })}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.avgResolutionDays')}
                  value={data.avgResolutionDays != null ? `${fmtDec(data.avgResolutionDays)} j` : '—'}
                  sub={t('supervisorAnalytics.kpi.avgResolutionDescription')}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.byStatus')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {statusEntries.length === 0
                      ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                      : statusEntries.map(({ status, count }) => (
                          <div key={status} className="flex items-center justify-between">
                            <Badge variant={statusVariant(status)}>{status}</Badge>
                            <span className="text-sm font-medium">{fmt(count)}</span>
                          </div>
                        ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.byPriority')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {priorityEntries.length === 0
                      ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                      : priorityEntries.map(({ priority, count }) => (
                          <div key={priority} className="flex items-center justify-between">
                            <Badge variant={priorityVariant(priority)}>{priority}</Badge>
                            <span className="text-sm font-medium">{fmt(count)}</span>
                          </div>
                        ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('supervisorAnalytics.sections.byType')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {correctiveCount === 0 && preventiveCount === 0
                    ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                    : (
                      <div className="flex gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground">{WorkOrderType.CORRECTIVE}</p>
                          <p className="text-lg font-semibold">{fmt(correctiveCount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{WorkOrderType.PREVENTIVE}</p>
                          <p className="text-lg font-semibold">{fmt(preventiveCount)}</p>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Asset KPIs ── */}
          {activeTab === 'assets' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label={t('supervisorAnalytics.kpi.globalMtbf')}
                  value={data.assetKpis.globalMtbfDays != null ? `${fmtDec(data.assetKpis.globalMtbfDays)} j` : '—'}
                  sub={t('supervisorAnalytics.kpi.globalMtbfDesc')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.globalMttr')}
                  value={data.assetKpis.globalMttrHours != null ? `${fmtDec(data.assetKpis.globalMttrHours)} h` : '—'}
                  sub={t('supervisorAnalytics.kpi.globalMttrDesc')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.preventiveCompliance')}
                  value={data.assetKpis.preventiveComplianceRate != null ? fmtPct(data.assetKpis.preventiveComplianceRate) : '—'}
                  sub={`${data.preventivePlanEfficiency.closedPreventiveWOs} / ${data.preventivePlanEfficiency.totalPreventiveWOs}`}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.totalMaintenanceCost')}
                  value={fmtCur(data.assetKpis.totalMaintenanceCost)}
                  sub={t('supervisorAnalytics.kpi.totalMaintenanceCostDesc')}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.topFailingAssets')}</CardTitle>
                    <CardDescription>{t('supervisorAnalytics.sections.topFailingAssetsDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.assetKpis.topByFailureFrequency.length === 0
                      ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                      : (
                        <table className="w-full text-sm">
                          <thead><tr className="border-b">
                            <th className="pb-2 text-left font-medium text-muted-foreground">{t('supervisorAnalytics.columns.asset')}</th>
                            <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.failureCount')}</th>
                            <th className="pb-2 text-right font-medium text-muted-foreground">{t('supervisorAnalytics.columns.lastFailure')}</th>
                          </tr></thead>
                          <tbody>
                            {data.assetKpis.topByFailureFrequency.map((item) => (
                              <tr key={item.assetId} className="border-b last:border-0">
                                <td className="py-2 pr-4">{item.assetName}</td>
                                <td className="py-2 text-center">
                                  <Badge variant={item.failureCount >= 5 ? 'destructive' : 'warning'}>{item.failureCount}</Badge>
                                </td>
                                <td className="py-2 text-right text-muted-foreground">
                                  {new Date(item.lastFailureDate).toLocaleDateString('fr-FR')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.topCostAssets')}</CardTitle>
                    <CardDescription>{t('supervisorAnalytics.sections.topCostAssetsDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.assetKpis.topByCost.length === 0
                      ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                      : (
                        <table className="w-full text-sm">
                          <thead><tr className="border-b">
                            <th className="pb-2 text-left font-medium text-muted-foreground">{t('supervisorAnalytics.columns.asset')}</th>
                            <th className="pb-2 text-right font-medium text-muted-foreground">{t('supervisorAnalytics.columns.totalCost')}</th>
                          </tr></thead>
                          <tbody>
                            {data.assetKpis.topByCost.map((item) => (
                              <tr key={item.assetId} className="border-b last:border-0">
                                <td className="py-2 pr-4">{item.assetName}</td>
                                <td className="py-2 text-right font-medium">{fmtCur(item.totalCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── Technician KPIs ── */}
          {activeTab === 'technicians' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('supervisorAnalytics.sections.technicianPerformance')}</CardTitle>
                  <CardDescription>{t('supervisorAnalytics.sections.technicianPerformanceDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {data.technicianKpis.length === 0
                    ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                    : (
                      <table className="w-full text-sm min-w-[700px]">
                        <thead><tr className="border-b">
                          <th className="pb-2 text-left font-medium text-muted-foreground">{t('supervisorAnalytics.columns.technician')}</th>
                          <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.closedWOs')}</th>
                          <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.firstPassRate')}</th>
                          <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.rejectionRate')}</th>
                          <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.avgActiveDuration')}</th>
                          <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.avgResponseTime')}</th>
                          <th className="pb-2 text-center font-medium text-muted-foreground">{t('supervisorAnalytics.columns.avgHolds')}</th>
                        </tr></thead>
                        <tbody>
                          {data.technicianKpis.map((item) => <TechRow key={item.technicianId} item={item} />)}
                        </tbody>
                      </table>
                    )}
                </CardContent>
              </Card>
              {data.technicianKpis.some((t) => t.rejectionCount > 0) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.technicianRejectionBreakdown')}</CardTitle>
                    <CardDescription>{t('supervisorAnalytics.sections.technicianRejectionBreakdownDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.technicianKpis.filter((item) => item.rejectionCount > 0).map((item) => (
                        <div key={item.technicianId}>
                          <p className="text-sm font-medium mb-1">
                            {item.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t('supervisorAnalytics.columns.rejectionCount')}: {item.rejectionCount}
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(item.rejectionRateByCategory).map(([reason, entry]) => (
                              <span key={reason} className="inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 bg-destructive/5 text-destructive border-destructive/20">
                                <span>{t(`validationRejectionReason.${reason}`, { defaultValue: reason })}</span>
                                <span className="font-semibold">×{entry.count}</span>
                                <span className="opacity-70">({fmtPct(entry.rate)})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ── Preventive plan efficiency ── */}
          {activeTab === 'preventive' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard
                  label={t('supervisorAnalytics.kpi.planComplianceRate')}
                  value={data.preventivePlanEfficiency.complianceRate != null ? fmtPct(data.preventivePlanEfficiency.complianceRate) : '—'}
                  sub={`${data.preventivePlanEfficiency.closedPreventiveWOs} / ${data.preventivePlanEfficiency.totalPreventiveWOs} ${t('supervisorAnalytics.kpi.preventiveClosedDesc')}`}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.anomalyRate')}
                  value={data.preventivePlanEfficiency.anomalyRate != null ? fmtPct(data.preventivePlanEfficiency.anomalyRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.anomalyRateDesc')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.totalPreventiveWOs')}
                  value={fmt(data.preventivePlanEfficiency.totalPreventiveWOs)}
                  sub={t('supervisorAnalytics.kpi.totalPreventiveWOsDesc')}
                />
              </div>
            </div>
          )}

          {/* ── Requester analytics ── */}
          {activeTab === 'requester' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  label={t('supervisorAnalytics.kpi.totalReportsSubmitted')}
                  value={fmt(data.requesterAnalytics.totalReportsSubmitted)}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.reportConversionRate')}
                  value={data.requesterAnalytics.conversionRate != null ? fmtPct(data.requesterAnalytics.conversionRate) : '—'}
                  sub={`${data.requesterAnalytics.totalConverted} ${t('supervisorAnalytics.kpi.reportsConverted')}`}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.reportToActionDelay')}
                  value={data.requesterAnalytics.reportToActionAvgDays != null ? `${fmtDec(data.requesterAnalytics.reportToActionAvgDays)} j` : '—'}
                  sub={t('supervisorAnalytics.kpi.reportToActionDelayDesc')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.reportAccuracyRate')}
                  value={data.requesterAnalytics.reportAccuracyRate != null ? fmtPct(data.requesterAnalytics.reportAccuracyRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.reportAccuracyRateDesc')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.duplicateSubmissionRate')}
                  value={data.requesterAnalytics.duplicateSubmissionRate != null ? fmtPct(data.requesterAnalytics.duplicateSubmissionRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.duplicateSubmissionRateDesc')}
                />
              </div>
            </div>
          )}

          {/* ── Operational overview ── */}
          {activeTab === 'operational' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <KpiCard
                  label={t('supervisorAnalytics.kpi.reassignmentCount')}
                  value={fmt(data.operationalOverview.reassignmentCount)}
                  sub={t('supervisorAnalytics.kpi.reassignmentCountDesc')}
                />
                <KpiCard
                  label={t('supervisorAnalytics.kpi.avgHoldPeriodsPerWo')}
                  value={data.operationalOverview.avgHoldPeriodsPerWo != null ? fmtDec(data.operationalOverview.avgHoldPeriodsPerWo) : '—'}
                  sub={t('supervisorAnalytics.kpi.avgHoldPeriodsDesc')}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.sourceDistribution')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.keys(data.operationalOverview.sourceDistribution).length === 0
                      ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                      : Object.entries(data.operationalOverview.sourceDistribution)
                          .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                          .map(([source, count]) => (
                            <div key={source} className="flex items-center justify-between">
                              <span className="text-sm">{source}</span>
                              <Badge variant="secondary">{count}</Badge>
                            </div>
                          ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('supervisorAnalytics.sections.rejectionReasons')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.keys(data.operationalOverview.rejectionReasonDistribution).length === 0
                      ? <p className="text-sm text-muted-foreground">{t('supervisorAnalytics.states.noData')}</p>
                      : Object.entries(data.operationalOverview.rejectionReasonDistribution)
                          .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                          .map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between">
                              <span className="text-sm">{reason}</span>
                              <Badge variant="outline">{count}</Badge>
                            </div>
                          ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
