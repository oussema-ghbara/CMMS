'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ProblemReportStatus, WorkOrderStatus } from '@gmao/shared';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ClipboardCheck, ClipboardList, Loader2, Wrench } from 'lucide-react';
import { workOrdersApi } from '@/lib/work-orders.api';
import { reportsApi } from '@/lib/reports.api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
};

function SummaryCard({ title, description, value, isLoading, icon: Icon, href, cta }: SummaryCardProps) {
  return (
    <Card>
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
          {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : formatCount(value ?? 0)}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
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
        queryFn: () => workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.IN_PROGRESS }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'on-hold'],
        queryFn: () => workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.ON_HOLD }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'work-orders', 'pending-validation'],
        queryFn: () => workOrdersApi.list({ page: 1, limit: 1, status: WorkOrderStatus.PENDING_VALIDATION }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'reports', 'pending'],
        queryFn: () => reportsApi.list({ page: 1, limit: 1, status: ProblemReportStatus.PENDING }),
        enabled: isInitialized,
      },
      {
        queryKey: ['supervisor', 'dashboard', 'reports', 'deferred'],
        queryFn: () => reportsApi.list({ page: 1, limit: 1, status: ProblemReportStatus.DEFERRED }),
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
  ] = results;

  const hasError = results.some((result) => result.isError);

  const activeWorkOrdersCount =
    (assignedWorkOrders.data?.total ?? 0) +
    (inProgressWorkOrders.data?.total ?? 0) +
    (onHoldWorkOrders.data?.total ?? 0);

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
          isLoading={assignedWorkOrders.isLoading || inProgressWorkOrders.isLoading || onHoldWorkOrders.isLoading}
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
          href="/supervisor/work-orders"
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
    </div>
  );
}
