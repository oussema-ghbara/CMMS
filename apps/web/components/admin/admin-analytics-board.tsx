'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Users,
  XCircle,
  CalendarClock,
} from 'lucide-react';
import { adminApi, type QueueStats, type UserActivityStats, type SystemHealthStats, type ScheduledJobStat } from '@/lib/admin.api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function getQueueFailedVariant(
  failed: number,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (failed > 0) return 'destructive';
  return 'success';
}

const QUEUE_DISPLAY_NAMES: Record<string, string> = {
  mail: 'Emails',
  'report-generation': 'Rapports PDF',
  'preventive-plan-generation': 'Plans préventifs',
};

function queueDisplayName(name: string): string {
  return QUEUE_DISPLAY_NAMES[name] ?? name;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  variant,
  description,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'warning' | 'danger';
  description?: string;
}) {
  const valueColor =
    variant === 'danger'
      ? 'text-destructive'
      : variant === 'warning'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-foreground';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor}`}>{formatNumber(value)}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function QueueCard({ queue, t }: { queue: QueueStats; t: (key: string) => string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{queueDisplayName(queue.name)}</CardTitle>
        <CardDescription className="font-mono text-xs text-muted-foreground">
          {queue.name}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('adminAnalytics.systemStats.queueWaiting')}</span>
            <Badge variant="secondary">{formatNumber(queue.waiting)}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('adminAnalytics.systemStats.queueActive')}</span>
            <Badge variant="secondary">{formatNumber(queue.active)}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('adminAnalytics.systemStats.queueFailed')}</span>
            <Badge variant={getQueueFailedVariant(queue.failed)}>
              {formatNumber(queue.failed)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('adminAnalytics.systemStats.queueCompleted')}</span>
            <Badge variant="outline">{formatNumber(queue.completed)}</Badge>
          </div>
          {queue.delayed > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t('adminAnalytics.systemStats.queueDelayed')}</span>
              <Badge variant="warning">{formatNumber(queue.delayed)}</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UserActivitySection({
  data,
  t,
}: {
  data: UserActivityStats;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const recencyRows: Array<{ key: keyof typeof data.loginRecency; labelKey: string; warnIfPositive?: boolean }> = [
    { key: 'last7Days', labelKey: 'adminAnalytics.userStats.last7Days' },
    { key: 'last7To30Days', labelKey: 'adminAnalytics.userStats.last7To30Days' },
    { key: 'last30To90Days', labelKey: 'adminAnalytics.userStats.last30To90Days' },
    { key: 'over90Days', labelKey: 'adminAnalytics.userStats.over90Days', warnIfPositive: true },
    { key: 'never', labelKey: 'adminAnalytics.userStats.never', warnIfPositive: true },
  ];

  const totalRecency = Object.values(data.loginRecency).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title={t('adminAnalytics.userStats.totalUsers')}
          value={data.totalUsers}
          icon={Users}
        />
        <KpiCard
          title={t('adminAnalytics.userStats.activeUsers')}
          value={data.activeUsers}
          icon={CheckCircle2}
        />
        <KpiCard
          title={t('adminAnalytics.userStats.inactiveAccounts')}
          value={data.inactiveAccounts}
          icon={XCircle}
          variant={data.inactiveAccounts > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          title={t('adminAnalytics.userStats.neverLoggedIn')}
          value={data.neverLoggedIn}
          icon={AlertTriangle}
          variant={data.neverLoggedIn > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          title={t('adminAnalytics.userStats.inactiveLast30Days')}
          value={data.inactiveLast30Days}
          icon={Clock}
          variant={data.inactiveLast30Days > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          title={t('adminAnalytics.userStats.inactiveLast90Days')}
          value={data.inactiveLast90Days}
          icon={Clock}
          variant={data.inactiveLast90Days > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Login recency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('adminAnalytics.userStats.loginRecency')}
            </CardTitle>
            <CardDescription>
              {t('adminAnalytics.userStats.loginRecencyDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recencyRows.map(({ key, labelKey, warnIfPositive }) => {
                const value = data.loginRecency[key];
                const pct = totalRecency > 0 ? (value / totalRecency) * 100 : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t(labelKey)}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatNumber(value)}</span>
                        <Badge
                          variant={
                            warnIfPositive && value > 0 ? 'warning' : 'secondary'
                          }
                          className="text-xs"
                        >
                          {pct.toFixed(1)} %
                        </Badge>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          warnIfPositive && value > 0
                            ? 'bg-yellow-500'
                            : 'bg-primary'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* By role */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('adminAnalytics.userStats.byRole')}
            </CardTitle>
            <CardDescription>
              {t('adminAnalytics.userStats.byRoleDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.byRole.map(({ role, count }) => (
                <div
                  key={role}
                  className="flex items-center justify-between py-1 border-b last:border-0"
                >
                  <span className="text-sm text-muted-foreground">
                    {t(`roles.${role}`, { defaultValue: role })}
                  </span>
                  <Badge variant="secondary">{formatNumber(count)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SystemHealthSection({
  data,
  t,
}: {
  data: SystemHealthStats;
  t: (key: string) => string;
}) {
  const { notifications } = data;

  return (
    <div className="space-y-6">
      {/* Notification delivery KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={t('adminAnalytics.systemStats.emailFailed')}
          value={notifications.emailFailed}
          icon={XCircle}
          variant={notifications.emailFailed > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          title={t('adminAnalytics.systemStats.emailPending')}
          value={notifications.emailPendingDelivery}
          icon={Clock}
          variant={notifications.emailPendingDelivery > 10 ? 'warning' : 'default'}
        />
        <KpiCard
          title={t('adminAnalytics.systemStats.emailSentLast24h')}
          value={notifications.totalSentLast24h}
          icon={CheckCircle2}
        />
      </div>

      {/* Queue cards */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('adminAnalytics.systemStats.queues')}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {data.queues.map((queue) => (
            <QueueCard key={queue.name} queue={queue} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

const JOB_DISPLAY_NAMES: Record<string, string> = {
  'access-retry-approaching': 'adminAnalytics.scheduledJobs.jobs.accessRetryApproaching',
  'contractor-date-overdue': 'adminAnalytics.scheduledJobs.jobs.contractorDateOverdue',
  'daily-summary': 'adminAnalytics.scheduledJobs.jobs.dailySummary',
  'due-date-approaching': 'adminAnalytics.scheduledJobs.jobs.dueDateApproaching',
  'priority-escalation': 'adminAnalytics.scheduledJobs.jobs.priorityEscalation',
  'validation-reminder': 'adminAnalytics.scheduledJobs.jobs.validationReminder',
};

function jobStatus(job: ScheduledJobStat): 'healthy' | 'failed' | 'unknown' {
  if (!job.lastRunAt) return 'unknown';
  if (job.lastFailureAt && (!job.lastSuccessAt || job.lastFailureAt > job.lastSuccessAt)) {
    return 'failed';
  }
  return 'healthy';
}

function formatRelative(isoDate: string | null, language: string): string {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat(language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

function ScheduledJobsSection({
  jobs,
  t,
  language,
}: {
  jobs: ScheduledJobStat[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  language: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{t('adminAnalytics.scheduledJobs.title')}</CardTitle>
        </div>
        <CardDescription>{t('adminAnalytics.scheduledJobs.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminAnalytics.scheduledJobs.noData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-4 text-left font-medium">{t('adminAnalytics.scheduledJobs.jobName')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('adminAnalytics.scheduledJobs.status')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('adminAnalytics.scheduledJobs.lastRun')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('adminAnalytics.scheduledJobs.lastSuccess')}</th>
                  <th className="py-2 text-left font-medium">{t('adminAnalytics.scheduledJobs.lastFailure')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const status = jobStatus(job);
                  const nameKey = JOB_DISPLAY_NAMES[job.jobName];
                  const displayName = nameKey ? t(nameKey) : job.jobName;
                  return (
                    <tr key={job.jobName} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{displayName}</td>
                      <td className="py-2 pr-4">
                        {status === 'healthy' && (
                          <Badge variant="success" className="text-xs">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {t('adminAnalytics.scheduledJobs.statusHealthy')}
                          </Badge>
                        )}
                        {status === 'failed' && (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="mr-1 h-3 w-3" />
                            {t('adminAnalytics.scheduledJobs.statusFailed')}
                          </Badge>
                        )}
                        {status === 'unknown' && (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="mr-1 h-3 w-3" />
                            {t('adminAnalytics.scheduledJobs.statusUnknown')}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatRelative(job.lastRunAt, language)}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatRelative(job.lastSuccessAt, language)}
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            job.lastFailureAt
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {formatRelative(job.lastFailureAt, language)}
                        </span>
                        {job.lastErrorMessage && (
                          <p className="mt-0.5 max-w-xs truncate text-[11px] text-destructive/80">
                            {job.lastErrorMessage}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

export function AdminAnalyticsBoard() {
  const { t, i18n } = useTranslation();

  const userQuery = useQuery({
    queryKey: ['admin', 'analytics', 'users'],
    queryFn: () => adminApi.getUserAnalytics(),
  });

  const systemQuery = useQuery({
    queryKey: ['admin', 'analytics', 'system'],
    queryFn: () => adminApi.getSystemHealth(),
  });

  const isLoading = userQuery.isLoading || systemQuery.isLoading;
  const isError = userQuery.isError || systemQuery.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t('adminAnalytics.states.loading')}</span>
      </div>
    );
  }

  if (isError || !userQuery.data || !systemQuery.data) {
    return (
      <div className="flex items-center justify-center py-16 text-destructive gap-2">
        <AlertTriangle className="h-5 w-5" />
        <span>{t('adminAnalytics.states.error')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* User Activity section */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {t('adminAnalytics.sections.userActivity')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('adminAnalytics.sections.userActivityDescription')}
          </p>
        </div>
        <UserActivitySection data={userQuery.data} t={t} />
      </section>

      {/* System Health section */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {t('adminAnalytics.sections.systemHealth')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('adminAnalytics.sections.systemHealthDescription')}
          </p>
        </div>
        <SystemHealthSection data={systemQuery.data} t={t} />
      </section>

      {/* Scheduled Jobs section */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {t('adminAnalytics.sections.scheduledJobs')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('adminAnalytics.sections.scheduledJobsDescription')}
          </p>
        </div>
        <ScheduledJobsSection
          jobs={systemQuery.data.scheduledJobs}
          t={t}
          language={i18n.language || 'fr'}
        />
      </section>
    </div>
  );
}
