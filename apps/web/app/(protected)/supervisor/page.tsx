'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ProblemReportStatus, WorkOrderStatus } from '@gmao/shared';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { workOrdersApi } from '@/lib/work-orders.api';
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
            limit: 1,
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
          href="/supervisor/work-orders"
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

      {/* Operational alert panels */}
      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t('supervisorDashboard.operational.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">

          {/* Recent closures today */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('supervisorDashboard.operational.closedToday.title')}
              </CardTitle>
              <CardDescription>
                {t('supervisorDashboard.operational.closedToday.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {closedToday.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-3xl font-bold tracking-tight">
                  {formatCount(closedToday.data?.total ?? 0)}
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/supervisor/work-orders">
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
                <Link href="/supervisor/work-orders">
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
