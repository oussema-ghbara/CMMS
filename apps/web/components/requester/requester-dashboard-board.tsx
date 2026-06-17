'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, PlusCircle, Search, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProblemReportStatus } from '@gmao/shared';
import { reportsApi } from '@/lib/reports.api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mono } from '@/components/ui/mono';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { StatusPill } from '@/components/ui/status-pill';

const SUMMARY_LIMIT = 5;

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function RequesterDashboardBoard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const query = useQuery({
    queryKey: ['requester', 'reports', user?.id],
    queryFn: () => reportsApi.list({ reporterId: user?.id, limit: 100 }),
    enabled: !!user?.id,
  });

  const reports = query.data?.data ?? [];

  const summary = useMemo(() => {
    return reports.reduce(
      (accumulator, report) => {
        accumulator.total += 1;
        if (report.status === ProblemReportStatus.PENDING) accumulator.pending += 1;
        if (report.status === ProblemReportStatus.CONVERTED) accumulator.converted += 1;
        if (report.status === ProblemReportStatus.ARCHIVED) accumulator.archived += 1;
        return accumulator;
      },
      { total: 0, pending: 0, converted: 0, archived: 0 },
    );
  }, [reports]);

  const recentReports = reports.slice(0, SUMMARY_LIMIT);

  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.18em">
            {t('roles.REQUESTER')}
          </Mono>
          <h1 style={{ margin: '8px 0 6px', fontSize: 28, lineHeight: 1.1, fontWeight: 700, color: 'var(--sb-text-primary)' }}>
            {t('requester.title')}
          </h1>
          <p style={{ margin: 0, color: 'var(--sb-text-secondary)', maxWidth: 760, lineHeight: 1.6 }}>
            {t('requester.subtitle')}
          </p>
        </div>
        <Link
          href="/requester/reports?create=1"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'var(--sb-text-primary)',
            color: 'var(--sb-bg)',
            textDecoration: 'none',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <PlusCircle size={14} />
          {t('requester.quickActions.openReports')}
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: t('requester.summary.totalReports'), value: summary.total },
          { label: t('requester.summary.pending'), value: summary.pending },
          { label: t('requester.summary.converted'), value: summary.converted },
          { label: t('requester.summary.archived'), value: summary.archived },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle>{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14, alignItems: 'start' }}>
        <Card>
          <CardHeader>
            <CardTitle>{t('requester.quickActions.title')}</CardTitle>
            <CardDescription>{t('requester.quickActions.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/requester/reports?create=1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--sb-text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                <Search size={16} />
                {t('requester.submit.title')}
              </Link>
              <Link href="/requester/reports" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--sb-text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                <ArrowRight size={16} />
                {t('requester.reports.title')}
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('requester.reports.title')}</CardTitle>
            <CardDescription>{t('requester.reports.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <TableLoading height={160} label={t('requester.reports.states.loading')} />
            ) : query.isError ? (
              <TableError label={t('requester.reports.states.error')} />
            ) : recentReports.length === 0 ? (
              <TableEmpty label={t('requester.reports.states.empty')} />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentReports.map((report) => (
                  <div key={report.id} style={{ border: '1px solid var(--sb-border)', borderRadius: 6, padding: 12, background: 'var(--sb-surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Mono size={10} color="var(--sb-text-secondary)" tracking="0.12em">
                            {report.referenceNumber}
                          </Mono>
                          <StatusPill status={report.status as ProblemReportStatus} />
                        </div>
                        <p style={{ margin: '8px 0 0', color: 'var(--sb-text-secondary)', lineHeight: 1.5 }}>
                          {report.description}
                        </p>
                      </div>
                      <span style={{ color: 'var(--sb-text-tertiary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatDateTime(report.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
