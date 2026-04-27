'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ProblemReportStatus, WorkOrderStatus } from '@gmao/shared';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Loader2,
  ShieldAlert,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { workOrdersApi, type TechnicianLoadItem, type AssetHealthItem, type WorkOrderListItem } from '@/lib/work-orders.api';
import { reportsApi } from '@/lib/reports.api';
import { assetsApi, type CertificateAlertItem } from '@/lib/assets.api';
import { partRequestsApi } from '@/lib/part-requests.api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { todayStartIso } from '@/lib/date-utils';

function formatCount(value: number) {
  return new Intl.NumberFormat('fr-FR').format(value);
}

type SummaryCardProps = {
  title: string;
  description: string;
  value: number | null;
  isLoading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  cta: string;
  variant?: 'default' | 'warning' | 'destructive';
};

function SummaryCard({
  title,
  description,
  value,
  isLoading,
  icon: Icon,
  href,
  cta,
  variant = 'default',
}: SummaryCardProps) {
  const borderClass =
    variant === 'destructive'
      ? 'border-destructive/50'
      : variant === 'warning'
        ? 'border-yellow-400/50'
        : '';
  return (
    <Card className={borderClass}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="rounded-md bg-muted p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-3xl font-bold tracking-tight">
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            formatCount(value ?? 0)
          )}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CertAlertRow({ item }: { item: CertificateAlertItem }) {
  const { t } = useTranslation();
  const isExpired = item.status === 'EXPIRED';
  const label = isExpired
    ? t('supervisorDashboard.certAlerts.expired')
    : t('supervisorDashboard.certAlerts.expiringSoon');
  const expDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(
    new Date(item.expirationDate),
  );
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{item.assetName}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{expDate}</span>
      <Badge variant={isExpired ? 'destructive' : 'warning'} className="shrink-0">
        {label}
      </Badge>
    </div>
  );
}

function OverdueWorkOrderRow({ item }: { item: WorkOrderListItem }) {
  const { t } = useTranslation();
  const daysOverdue = item.dueDate
    ? Math.floor((Date.now() - new Date(item.dueDate).getTime()) / 86_400_000)
    : 0;
  return (
    <Link
      href={`/supervisor/work-orders?id=${item.id}`}
      className="flex items-center justify-between gap-2 rounded py-2 px-1 text-sm transition-colors hover:bg-muted/50"
      title={t('supervisorDashboard.overduePanel.viewWo')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Clock className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <div className="min-w-0">
          <span className="block truncate font-medium">{item.referenceNumber}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.asset.name}</span>
        </div>
      </div>
      <Badge variant="destructive" className="shrink-0 text-[10px]">
        {t('supervisorDashboard.overduePanel.daysOverdue', { count: daysOverdue })}
      </Badge>
    </Link>
  );
}

function ClosedTodayRow({ item }: { item: WorkOrderListItem }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/supervisor/work-orders?id=${item.id}`}
      className="flex items-center justify-between gap-2 rounded py-2 px-1 text-sm transition-colors hover:bg-muted/50"
      title={t('supervisorDashboard.operational.closedToday.viewWo')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
        <div className="min-w-0">
          <span className="block truncate font-medium">{item.asset.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.principalTechnician?.name ?? t('supervisorDashboard.operational.closedToday.noTechnician')}
          </span>
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {t(`supervisorWorkOrders.type.${item.type}`)}
      </Badge>
    </Link>
  );
}

function TechnicianLoadRow({ item }: { item: TechnicianLoadItem }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/supervisor/work-orders?technicianId=${item.technicianId}`}
      className="flex items-center justify-between gap-2 rounded py-1.5 px-1 text-sm transition-colors hover:bg-muted/50"
      title={t('supervisorDashboard.technicianLoad.viewQueue')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{item.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t('supervisorDashboard.technicianLoad.woCount', { count: item.openWoCount })}
        </span>
        {item.hasCritical && (
          <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
            {t('supervisorDashboard.technicianLoad.criticalLabel')}
          </Badge>
        )}
      </div>
    </Link>
  );
}

export default function SupervisorDashboardPage() {
  const { t } = useTranslation();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const results = useQueries({
    queries: [
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'all'],
        queryFn: () => workOrdersApi.list({ page: 1, limit: 1 }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'assigned'],
        queryFn: () => workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.ASSIGNED }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'in-progress'],
        queryFn: () =>
          workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.IN_PROGRESS }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'on-hold'],
        queryFn: () => workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.ON_HOLD }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'pending-validation'],
        queryFn: () =>
          workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.PENDING_VALIDATION }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'reports', 'pending'],
        queryFn: () => reportsApi.list({ page: 1, limit: 1, status: ProblemReportStatus.PENDING }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'reports', 'deferred'],
        queryFn: () =>
          reportsApi.list({ page: 1, limit: 1, status: ProblemReportStatus.DEFERRED }),
        enabled: isInitialized,
      },
      // Operational panels
      {
        queryKey: ['supervisor', 'dashboard', 'certificate-alerts'],
        queryFn: () => assetsApi.getCertificateAlerts(),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'closed-today'],
        queryFn: () =>
          workOrdersApi.list({
            page: 1,
            limit: 5,
            status: WorkOrderStatus.CLOSED,
            closedAfter: todayStartIso(),
          }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'part-requests', 'pending'],
        queryFn: () => partRequestsApi.getQueue({ status: 'PENDING' as any, limit: 100 }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'technician-load'],
        queryFn: () => workOrdersApi.getTechnicianLoad(),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'asset-health'],
        queryFn: () => workOrdersApi.getAssetHealth({ thresholdCount: 3, periodDays: 90 }),
        enabled: isInitialized,
      },
      // §9.3: dedicated overdue WO panel
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'overdue'],
        queryFn: () => workOrdersApi.list({ page: 1, limit: 5, isOverdue: true }),
        enabled: isInitialized,
      },
    ],
  });

  const [
    allWorkOrders,
    assignedWorkOrders,
    inProgressWorkOrders,
    onHoldWorkOrders,
    pendingValidationWorkOrders,
    pendingReports,
    deferredReports,
    certAlerts,
    closedToday,
    pendingPartRequests,
    technicianLoad,
    assetHealth,
    overdueWorkOrders,
  ] = results;

  const hasError = results.some((result) => result.isError);

  const activeWorkOrdersCount =
    (assignedWorkOrders.data?.total ?? 0) +
    (inProgressWorkOrders.data?.total ?? 0) +
    (onHoldWorkOrders.data?.total ?? 0);

  const blockedPartRequestsCount = (pendingPartRequests.data?.data ?? []).filter(
    (r) => r.workOrder.status === WorkOrderStatus.ON_HOLD,
  ).length;

  const certAlertItems = certAlerts.data ?? [];
  const expiredCount = certAlertItems.filter((c) => c.status === 'EXPIRED').length;
  const assetHealthItems = (assetHealth.data ?? []) as AssetHealthItem[];
  const expiringSoonCount = certAlertItems.filter((c) => c.status === 'EXPIRING_SOON').length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('supervisorDashboard.title')}</h1>
        <p className="text-muted-foreground">{t('supervisorDashboard.subtitle')}</p>
      </div>

      {hasError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('supervisorDashboard.states.error')}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={t('supervisorDashboard.cards.totalWorkOrders.title')}
          description={t('supervisorDashboard.cards.totalWorkOrders.description')}
          value={allWorkOrders.data?.total ?? 0}
          isLoading={allWorkOrders.isLoading}
          icon={ClipboardList}
          href="/supervisor/work-orders"
          cta={t('supervisorDashboard.cards.totalWorkOrders.cta')}
        />

        <SummaryCard
          title={t('supervisorDashboard.cards.activeWorkOrders.title')}
          description={t('supervisorDashboard.cards.activeWorkOrders.description')}
          value={activeWorkOrdersCount}
          isLoading={
            assignedWorkOrders.isLoading ||
            inProgressWorkOrders.isLoading ||
            onHoldWorkOrders.isLoading
          }
          icon={Wrench}
          href="/supervisor/work-orders?isActive=true"
          cta={t('supervisorDashboard.cards.activeWorkOrders.cta')}
        />

        <SummaryCard
          title={t('supervisorDashboard.cards.pendingValidation.title')}
          description={t('supervisorDashboard.cards.pendingValidation.description')}
          value={pendingValidationWorkOrders.data?.total ?? 0}
          isLoading={pendingValidationWorkOrders.isLoading}
          icon={ClipboardCheck}
          href="/supervisor/validation-queue"
          cta={t('supervisorDashboard.cards.pendingValidation.cta')}
        />

        <SummaryCard
          title={t('supervisorDashboard.cards.pendingReports.title')}
          description={t('supervisorDashboard.cards.pendingReports.description')}
          value={(pendingReports.data?.total ?? 0) + (deferredReports.data?.total ?? 0)}
          isLoading={pendingReports.isLoading || deferredReports.isLoading}
          icon={AlertTriangle}
          href="/supervisor/reports"
          cta={t('supervisorDashboard.cards.pendingReports.cta')}
        />
      </div>

      {/* §9.3: Overdue work orders panel */}
      {((overdueWorkOrders.data?.total ?? 0) > 0 || overdueWorkOrders.isLoading) && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-destructive">
              {t('supervisorDashboard.overduePanel.title', {
                count: overdueWorkOrders.data?.total ?? 0,
              })}
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/supervisor/work-orders?isOverdue=true">
                {t('supervisorDashboard.overduePanel.viewAll')}
              </Link>
            </Button>
          </div>
          <Card className="border-destructive/50">
            <CardContent className="pt-4">
              {overdueWorkOrders.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : !overdueWorkOrders.data?.data.length ? null : (
                <div className="divide-y">
                  {overdueWorkOrders.data.data.map((wo) => (
                    <OverdueWorkOrderRow key={wo.id} item={wo} />
                  ))}
                  {(overdueWorkOrders.data?.total ?? 0) > 5 && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      {t('supervisorDashboard.overduePanel.more', {
                        count: (overdueWorkOrders.data?.total ?? 0) - 5,
                      })}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Technician load panel (§9.3) */}
      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t('supervisorDashboard.technicianLoad.title')}
        </h2>
        <Card>
          <CardContent className="pt-4">
            {technicianLoad.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : !technicianLoad.data || technicianLoad.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('supervisorDashboard.technicianLoad.none')}
              </p>
            ) : (
              <div className="divide-y">
                {technicianLoad.data.map((item) => (
                  <TechnicianLoadRow key={item.technicianId} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Asset health panel (§9.3) */}
      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t('supervisorDashboard.assetHealth.title')}
        </h2>
        <Card className={assetHealthItems.length > 0 ? 'border-destructive/40' : ''}>
          <CardContent className="pt-4">
            {assetHealth.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : assetHealthItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('supervisorDashboard.assetHealth.none')}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {t('supervisorDashboard.assetHealth.description', { count: assetHealthItems.length })}
                </p>
                <div className="divide-y">
                  {assetHealthItems.map((item) => (
                    <div key={item.assetId} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-destructive shrink-0" />
                        <span className="text-sm font-medium">{item.assetName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {t('supervisorDashboard.assetHealth.lastFailure', {
                            date: new Date(item.lastFailureDate).toLocaleDateString('fr-FR'),
                          })}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          {item.failureCount}×
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operational alert panels */}
      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t('supervisorDashboard.operational.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">

          {/* Recent closures today: asset, technician, WO type */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">
                    {t('supervisorDashboard.operational.closedToday.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('supervisorDashboard.operational.closedToday.description')}
                  </CardDescription>
                </div>
                {(closedToday.data?.total ?? 0) > 0 && (
                  <span className="text-2xl font-bold">
                    {formatCount(closedToday.data?.total ?? 0)}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {closedToday.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : !closedToday.data?.data.length ? (
                <p className="text-sm text-muted-foreground">
                  {t('supervisorDashboard.operational.closedToday.none')}
                </p>
              ) : (
                <div className="divide-y">
                  {closedToday.data.data.map((wo) => (
                    <ClosedTodayRow key={wo.id} item={wo} />
                  ))}
                  {(closedToday.data.total ?? 0) > 5 && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      {t('supervisorDashboard.operational.closedToday.more', {
                        count: closedToday.data.total - 5,
                      })}
                    </p>
                  )}
                </div>
              )}
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link
                  href={`/supervisor/work-orders?status=${WorkOrderStatus.CLOSED}`}
                >
                  {t('supervisorDashboard.operational.closedToday.cta')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Blocked part requests */}
          <Card className={blockedPartRequestsCount > 0 ? 'border-yellow-400/50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('supervisorDashboard.operational.blockedPartRequests.title')}
              </CardTitle>
              <CardDescription>
                {t('supervisorDashboard.operational.blockedPartRequests.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingPartRequests.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p
                  className={`text-3xl font-bold tracking-tight ${blockedPartRequestsCount > 0 ? 'text-yellow-600' : ''}`}
                >
                  {formatCount(blockedPartRequestsCount)}
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href={`/supervisor/work-orders?status=${WorkOrderStatus.ON_HOLD}`}>
                  {t('supervisorDashboard.operational.blockedPartRequests.cta')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Certificate alerts */}
          <Card
            className={
              expiredCount > 0
                ? 'border-destructive/50'
                : expiringSoonCount > 0
                  ? 'border-yellow-400/50'
                  : ''
            }
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">
                    {t('supervisorDashboard.certAlerts.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('supervisorDashboard.certAlerts.description')}
                  </CardDescription>
                </div>
                {(expiredCount > 0 || expiringSoonCount > 0) && (
                  <ShieldAlert
                    className={`h-4 w-4 shrink-0 ${expiredCount > 0 ? 'text-destructive' : 'text-yellow-500'}`}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {certAlerts.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : certAlertItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('supervisorDashboard.certAlerts.none')}
                </p>
              ) : (
                <>
                  <div className="divide-y">
                    {certAlertItems.slice(0, 4).map((item, i) => (
                      <CertAlertRow key={`${item.assetId}-${i}`} item={item} />
                    ))}
                  </div>
                  {certAlertItems.length > 4 && (
                    <p className="text-xs text-muted-foreground">
                      {t('supervisorDashboard.certAlerts.more', {
                        count: certAlertItems.length - 4,
                      })}
                    </p>
                  )}
                  <Button asChild variant="outline" size="sm" className="mt-1">
                    <Link href="/supervisor/assets">
                      {t('supervisorDashboard.certAlerts.cta')}
                    </Link>
                  </Button>
                </>
              )}
              {certAlertItems.length === 0 && !certAlerts.isLoading && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <X className="h-3 w-3" />
                  <span>{t('supervisorDashboard.certAlerts.none')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
