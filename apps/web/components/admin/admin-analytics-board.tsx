'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, ChevronLeft, ChevronRight,
  Loader2,
} from 'lucide-react';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import {
  adminApi,
  type UserActivityStats,
  type UserLoginFrequencyEntry,
} from '@/lib/admin.api';
import { FREQUENCY_BADGE_VARIANT, formatLoginDate } from '@/lib/login-frequency-utils';
import { Button } from '@/components/ui/button';
import { Mono } from '@/components/ui/mono';

const C = {
  border:       'var(--sb-border)',
  surface:      'var(--sb-surface)',
  textPrimary:  'var(--sb-text-primary)',
  textSecondary:'var(--sb-text-secondary)',
  textTertiary: 'var(--sb-text-tertiary)',
  sDone:        'var(--sb-s-done)',
  sDoneBg:      'var(--sb-s-done-bg)',
  sWait:        'var(--sb-s-wait)',
  sWaitBg:      'var(--sb-s-wait-bg)',
  sActive:      'var(--sb-s-active)',
  sActiveBg:    'var(--sb-s-active-bg)',
  sCancel:      'var(--sb-s-cancel)',
  sCancelBg:    'var(--sb-s-cancel-bg)',
  sOpen:        'var(--sb-s-open)',
  sOpenBg:      'var(--sb-s-open-bg)',
  pCrit:        'var(--sb-p-crit)',
  pCritBg:      'var(--sb-p-crit-bg)',
  pHigh:        'var(--sb-p-high)',
  pHighBg:      'var(--sb-p-high-bg)',
};

function SectionBox({ title, description, children, style }: { title: string; description?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 2, overflow: 'hidden', background: 'white', ...style }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '8px 14px' }}>
        <Mono size={10} color={C.textSecondary} tracking="0.13em">{title.toUpperCase()}</Mono>
        {description && <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ padding: '14px' }}>{children}</div>
    </div>
  );
}

function SandboxPill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, border: `1px solid ${color}28`, borderRadius: 2, padding: '2px 7px 2px 5px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      <Mono size={9} color={color} tracking="0.10em">{label}</Mono>
    </span>
  );
}

function CountBadge({ value, color, bg }: { value: number; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', background: bg, border: `1px solid ${color}28`, borderRadius: 2, padding: '1px 6px' }}>
      <Mono size={9} color={color} tracking="0.08em">{String(value)}</Mono>
    </span>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function KpiCell({ title, value, variant }: { title: string; value: number; variant?: 'default' | 'warning' | 'danger' }) {
  const valueColor = variant === 'danger' ? C.pCrit : variant === 'warning' ? C.pHigh : C.textPrimary;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 2, padding: '14px 16px', background: 'white' }}>
      <Mono size={9} color={C.textTertiary} tracking="0.13em" style={{ display: 'block', marginBottom: 8 }}>{title.toUpperCase()}</Mono>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: valueColor, lineHeight: 1 }}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

const FREQUENCY_VARIANT_MAP: Record<string, { color: string; bg: string; label?: string }> = {
  HIGH:    { color: C.sDone,   bg: C.sDoneBg },
  MEDIUM:  { color: C.sActive, bg: C.sActiveBg },
  LOW:     { color: C.pHigh,   bg: C.pHighBg },
  NONE:    { color: C.pCrit,   bg: C.pCritBg },
};

function UserActivitySection({ data, t }: { data: UserActivityStats; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const recencyRows: Array<{ key: keyof typeof data.loginRecency; labelKey: string; warn?: boolean }> = [
    { key: 'last7Days',      labelKey: 'adminAnalytics.userStats.last7Days' },
    { key: 'last7To30Days',  labelKey: 'adminAnalytics.userStats.last7To30Days' },
    { key: 'last30To90Days', labelKey: 'adminAnalytics.userStats.last30To90Days' },
    { key: 'over90Days',     labelKey: 'adminAnalytics.userStats.over90Days', warn: true },
    { key: 'never',          labelKey: 'adminAnalytics.userStats.never',      warn: true },
  ];
  const totalRecency = Object.values(data.loginRecency).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <KpiCell title={t('adminAnalytics.userStats.totalUsers')} value={data.totalUsers} />
        <KpiCell title={t('adminAnalytics.userStats.activeUsers')} value={data.activeUsers} />
        <KpiCell title={t('adminAnalytics.userStats.inactiveAccounts')} value={data.inactiveAccounts} variant={data.inactiveAccounts > 0 ? 'warning' : 'default'} />
        <KpiCell title={t('adminAnalytics.userStats.neverLoggedIn')} value={data.neverLoggedIn} variant={data.neverLoggedIn > 0 ? 'warning' : 'default'} />
        <KpiCell title={t('adminAnalytics.userStats.inactiveLast30Days')} value={data.inactiveLast30Days} variant={data.inactiveLast30Days > 0 ? 'warning' : 'default'} />
        <KpiCell title={t('adminAnalytics.userStats.inactiveLast90Days')} value={data.inactiveLast90Days} variant={data.inactiveLast90Days > 0 ? 'danger' : 'default'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        <SectionBox title={t('adminAnalytics.userStats.loginRecency')} description={t('adminAnalytics.userStats.loginRecencyDescription')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recencyRows.map(({ key, labelKey, warn }) => {
              const value = data.loginRecency[key];
              const pct = totalRecency > 0 ? (value / totalRecency) * 100 : 0;
              const barColor = warn && value > 0 ? C.pHigh : C.sActive;
              return (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.textSecondary }}>{t(labelKey)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{formatNumber(value)}</span>
                      <span style={{ display: 'inline-flex', background: warn && value > 0 ? C.pHighBg : C.sActiveBg, border: `1px solid ${warn && value > 0 ? C.pHigh : C.sActive}28`, borderRadius: 2, padding: '1px 5px' }}>
                        <Mono size={9} color={warn && value > 0 ? C.pHigh : C.sActive} tracking="0.08em">{pct.toFixed(1)}%</Mono>
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s', width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionBox>

        <SectionBox title={t('adminAnalytics.userStats.byRole')} description={t('adminAnalytics.userStats.byRoleDescription')}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.byRole.map(({ role, count }, idx) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < data.byRole.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ fontSize: 12, color: C.textSecondary }}>{t(`roles.${role}`, { defaultValue: role })}</span>
                <CountBadge value={count} color={C.sOpen} bg={C.sOpenBg} />
              </div>
            ))}
          </div>
        </SectionBox>
      </div>
    </div>
  );
}

const FREQUENCY_PAGE_SIZE = 20;

function UserLoginFrequencyTable({ t, language }: { t: (key: string, opts?: Record<string, unknown>) => string; language: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'users', 'frequency', page] as const,
    queryFn: () => adminApi.getUserLoginFrequency({ page, limit: FREQUENCY_PAGE_SIZE }),
  });

  const totalPages = data ? Math.ceil(data.total / FREQUENCY_PAGE_SIZE) : 1;
  const formatDate = (iso: string | null) => formatLoginDate(iso, language) ?? t('adminAnalytics.userStats.loginFrequencyNever');

  return (
    <SectionBox title={t('adminAnalytics.userStats.loginFrequencyTable')} description={t('adminAnalytics.userStats.loginFrequencyTableDescription')}>
      {isLoading ? (
        <TableLoading />
      ) : !data || data.data.length === 0 ? (
        <TableEmpty label={t('adminAnalytics.userStats.loginFrequencyEmpty')} />
      ) : (
        <>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 120px', background: C.surface, borderBottom: `1px solid ${C.border}`, margin: '-14px -14px 0', padding: '0 14px' }}>
            {[
              t('adminAnalytics.userStats.loginFrequencyColumns.user'),
              t('adminAnalytics.userStats.loginFrequencyColumns.roles'),
              t('adminAnalytics.userStats.loginFrequencyColumns.lastLogin'),
              t('adminAnalytics.userStats.loginFrequencyColumns.frequency'),
            ].map((col, i) => (
              <div key={i} style={{ padding: '8px 0' }}>
                <Mono size={9} color={C.textSecondary} tracking="0.13em">{col.toUpperCase()}</Mono>
              </div>
            ))}
          </div>

          {data.data.map((entry: UserLoginFrequencyEntry, idx) => {
            const freqMeta = FREQUENCY_VARIANT_MAP[entry.frequencyCategory] ?? { color: C.sCancel, bg: C.sCancelBg };
            const freqKey = FREQUENCY_BADGE_VARIANT[entry.frequencyCategory];
            return (
              <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 120px', padding: '0', borderTop: idx === 0 ? `1px solid ${C.border}` : `1px solid ${C.border}`, alignItems: 'center', minHeight: 42 }}>
                <div style={{ padding: '10px 8px 10px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{entry.name}</div>
                  <div style={{ fontSize: 11, color: C.textTertiary }}>{entry.email}</div>
                </div>
                <div style={{ padding: '10px 8px 10px 0', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {entry.roles.map((role) => (
                    <span key={role} style={{ display: 'inline-flex', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '1px 5px' }}>
                      <Mono size={9} color={C.textSecondary} tracking="0.08em">{t(`roles.${role}`, { defaultValue: role })}</Mono>
                    </span>
                  ))}
                </div>
                <div style={{ padding: '10px 8px 10px 0' }}>
                  <Mono size={10} color={C.textTertiary} tracking="0.08em">{formatDate(entry.lastLoginAt)}</Mono>
                </div>
                <div style={{ padding: '10px 0' }}>
                  <SandboxPill color={freqMeta.color} bg={freqMeta.bg} label={t(`adminAnalytics.userStats.loginFrequencyCategory.${entry.frequencyCategory}`)} />
                </div>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${C.border}`, marginTop: 12 }}>
              <Mono size={9} color={C.textTertiary} tracking="0.08em">
                {(page - 1) * FREQUENCY_PAGE_SIZE + 1}–{Math.min(page * FREQUENCY_PAGE_SIZE, data.total)} / {data.total}
              </Mono>
              <div style={{ display: 'flex', gap: 4 }}>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft style={{ width: 12, height: 12 }} />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight style={{ width: 12, height: 12 }} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </SectionBox>
  );
}

export function AdminAnalyticsBoard() {
  const { t, i18n } = useTranslation();

  const userQuery = useQuery({ queryKey: ['admin', 'analytics', 'users'], queryFn: () => adminApi.getUserAnalytics() });

  const isLoading = userQuery.isLoading;
  const isError   = userQuery.isError;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 8 }}>
        <Loader2 style={{ width: 16, height: 16, color: C.textTertiary, animation: 'spin 1s linear infinite' }} />
        <Mono size={11} color={C.textTertiary} tracking="0.12em">{t('adminAnalytics.states.loading').toUpperCase()}</Mono>
      </div>
    );
  }

  if (isError || !userQuery.data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 8, background: C.pCritBg, border: `1px solid ${C.pCrit}28`, borderRadius: 2 }}>
        <AlertTriangle style={{ width: 16, height: 16, color: C.pCrit }} />
        <Mono size={11} color={C.pCrit} tracking="0.12em">{t('adminAnalytics.states.error').toUpperCase()}</Mono>
      </div>
    );
  }

  const sectionHeaderStyle: React.CSSProperties = { marginBottom: 12 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      <section>
        <div style={sectionHeaderStyle}>
          <Mono size={11} color={C.textSecondary} tracking="0.15em" style={{ display: 'block', marginBottom: 4 }}>{t('adminAnalytics.sections.userActivity').toUpperCase()}</Mono>
          <div style={{ fontSize: 12, color: C.textTertiary }}>{t('adminAnalytics.sections.userActivityDescription')}</div>
        </div>
        <UserActivitySection data={userQuery.data} t={t} />
        <div style={{ marginTop: 14 }}>
          <UserLoginFrequencyTable t={t} language={i18n.language || 'fr'} />
        </div>
      </section>

    </div>
  );
}
