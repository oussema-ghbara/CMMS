'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ProblemReportStatus, WorkOrderStatus } from '@gmao/shared';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { workOrdersApi, type TechnicianLoadItem, type AssetHealthItem, type WorkOrderListItem } from '@/lib/work-orders.api';
import { reportsApi } from '@/lib/reports.api';
import { assetsApi, type CertificateAlertItem } from '@/lib/assets.api';
import { partRequestsApi } from '@/lib/part-requests.api';
import { useAuthStore } from '@/store/auth.store';
import { Mono } from '@/components/ui/mono';
import { todayStartIso } from '@/lib/date-utils';

function formatCount(value: number) {
  return new Intl.NumberFormat('fr-FR').format(value);
}

const C = {
  crit:    '#B53525',
  critBg:  '#FDF0EE',
  high:    '#A06020',
  highBg:  '#FDF5E8',
  norm:    '#3A6A8C',
  done:    '#2E7A4E',
  doneBg:  '#EAF5EF',
  wait:    '#7A6020',
  waitBg:  '#FDF8E8',
  accent:  '#C49820',
  border:  '#DDE0E5',
  surface: '#F1F2F4',
  rail:    '#181613',
  textPri: '#18161A',
  textSec: '#6B6863',
  textTer: '#9E9A95',
} as const;

const SECTION_HEADER: React.CSSProperties = {
  background: C.rail,
  padding: '6px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const SECTION_WRAP: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 2,
  overflow: 'hidden',
};

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={SECTION_HEADER}>
      <Mono size={9} color="var(--sb-text-on-rail)" weight={700} tracking="0.15em">
        {label}
      </Mono>
      {right}
    </div>
  );
}

function KpiCell({
  label,
  value,
  isLoading,
  href,
  cta,
  valueColor,
}: {
  label: string;
  value: number | null;
  isLoading: boolean;
  href: string;
  cta: string;
  valueColor?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '16px 20px',
        background: 'var(--sb-bg)',
        textDecoration: 'none',
        borderRight: `1px solid ${C.border}`,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--sb-surface)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--sb-bg)'; }}
    >
      <Mono size={9} color={C.textTer} tracking="0.13em">{label}</Mono>
      <span style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: valueColor ?? C.textPri,
      }}>
        {isLoading
          ? <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: C.textTer }} />
          : formatCount(value ?? 0)
        }
      </span>
      <Mono size={9} color={C.norm} tracking="0.1em" style={{ marginTop: 2 }}>{cta} →</Mono>
    </Link>
  );
}

function OverdueRow({ item }: { item: WorkOrderListItem }) {
  const daysOverdue = item.dueDate
    ? Math.floor((Date.now() - new Date(item.dueDate).getTime()) / 86_400_000)
    : 0;
  return (
    <Link
      href={`/supervisor/work-orders?id=${item.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 12px',
        borderLeft: `3px solid ${C.crit}`,
        background: 'var(--sb-bg)',
        textDecoration: 'none',
        borderBottom: `1px solid ${C.border}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = C.critBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--sb-bg)'; }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 11, fontWeight: 700, color: C.textPri, letterSpacing: '0.05em' }}>
          {item.referenceNumber}
        </div>
        <div style={{ fontSize: 12, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.asset.name}
        </div>
      </div>
      <span style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 10,
        fontWeight: 700,
        color: C.crit,
        background: C.critBg,
        border: `1px solid ${C.crit}44`,
        borderRadius: 2,
        padding: '2px 6px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {daysOverdue}J
      </span>
    </Link>
  );
}

function TechnicianLoadRow({ item, maxLoad }: { item: TechnicianLoadItem; maxLoad: number }) {
  const barPct = maxLoad > 0 ? (item.openWoCount / maxLoad) * 100 : 0;
  const barColor = item.hasCritical ? C.crit : item.openWoCount > 3 ? C.high : C.norm;
  return (
    <Link
      href={`/supervisor/work-orders?technicianId=${item.technicianId}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: 'var(--sb-bg)',
        textDecoration: 'none',
        borderBottom: `1px solid ${C.border}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = C.surface; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--sb-bg)'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
          {item.name}
        </div>
        <div style={{ height: 3, background: C.border, borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 1, transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Mono size={10} color={C.textSec} tracking="0.05em">{item.openWoCount} OT</Mono>
        {item.hasCritical && (
          <span style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 9,
            fontWeight: 700,
            color: C.crit,
            background: C.critBg,
            border: `1px solid ${C.crit}44`,
            borderRadius: 2,
            padding: '1px 5px',
            letterSpacing: '0.1em',
          }}>
            CRIT
          </span>
        )}
      </div>
    </Link>
  );
}

function AssetHealthRow({ item }: { item: AssetHealthItem }) {
  const severity = item.failureCount >= 6 ? C.crit : item.failureCount >= 4 ? C.high : C.wait;
  const severityBg = item.failureCount >= 6 ? C.critBg : item.failureCount >= 4 ? C.highBg : C.waitBg;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '8px 12px',
      borderBottom: `1px solid ${C.border}`,
      borderLeft: `3px solid ${severity}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.textPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.assetName}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Mono size={10} color={C.textSec} tracking="0.05em">
          {new Date(item.lastFailureDate).toLocaleDateString('fr-FR')}
        </Mono>
        <span style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 10,
          fontWeight: 800,
          color: severity,
          background: severityBg,
          border: `1px solid ${severity}44`,
          borderRadius: 2,
          padding: '2px 6px',
        }}>
          {item.failureCount}×
        </span>
      </div>
    </div>
  );
}

function ClosedTodayRow({ item }: { item: WorkOrderListItem }) {
  return (
    <Link
      href={`/supervisor/work-orders?id=${item.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        background: 'var(--sb-bg)',
        textDecoration: 'none',
        borderBottom: `1px solid ${C.border}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = C.doneBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--sb-bg)'; }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.done, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.asset.name}
        </div>
        <div style={{ fontSize: 11, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.principalTechnician?.name ?? '—'}
        </div>
      </div>
    </Link>
  );
}

function CertAlertRow({ item }: { item: CertificateAlertItem }) {
  const isExpired = item.status === 'EXPIRED';
  const color = isExpired ? C.crit : C.high;
  const bg = isExpired ? C.critBg : C.highBg;
  const expDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(
    new Date(item.expirationDate),
  );
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '7px 12px',
      borderBottom: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.textPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.assetName}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Mono size={10} color={C.textSec} tracking="0.05em">{expDate}</Mono>
        <span style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 9,
          fontWeight: 700,
          color,
          background: bg,
          border: `1px solid ${color}44`,
          borderRadius: 2,
          padding: '2px 5px',
          letterSpacing: '0.1em',
        }}>
          {isExpired ? 'EXPIRÉ' : 'BIENTÔT'}
        </span>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '14px 12px' }}>
      <Mono size={11} color={C.textTer} tracking="0.08em">{text}</Mono>
    </div>
  );
}

function LoadingRow() {
  return (
    <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', color: C.textTer }} />
      <Mono size={11} color={C.textTer} tracking="0.08em">Chargement…</Mono>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ textDecoration: 'none' }}
    >
      <Mono size={9} color="var(--sb-text-on-rail)" tracking="0.12em" style={{ opacity: 0.75 }}>
        {children} →
      </Mono>
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
  const expiringSoonCount = certAlertItems.filter((c) => c.status === 'EXPIRING_SOON').length;
  const assetHealthItems = (assetHealth.data ?? []) as AssetHealthItem[];
  const techLoadItems = technicianLoad.data ?? [];
  const maxTechLoad = Math.max(...techLoadItems.map((t) => t.openWoCount), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div>
        <Mono size={10} color={C.textTer} tracking="0.15em" block>{t('supervisorDashboard.title')}</Mono>
        <div style={{ fontSize: 13, color: C.textSec, marginTop: 3 }}>{t('supervisorDashboard.subtitle')}</div>
      </div>

      {hasError && (
        <div style={{
          border: `1px solid ${C.crit}44`,
          background: C.critBg,
          borderRadius: 2,
          padding: '8px 12px',
          fontSize: 12,
          color: C.crit,
        }}>
          {t('supervisorDashboard.states.error')}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <KpiCell
          label={t('supervisorDashboard.cards.totalWorkOrders.title')}
          value={allWorkOrders.data?.total ?? 0}
          isLoading={allWorkOrders.isLoading}
          href="/supervisor/work-orders"
          cta={t('supervisorDashboard.cards.totalWorkOrders.cta')}
        />
        <KpiCell
          label={t('supervisorDashboard.cards.activeWorkOrders.title')}
          value={activeWorkOrdersCount}
          isLoading={assignedWorkOrders.isLoading || inProgressWorkOrders.isLoading || onHoldWorkOrders.isLoading}
          href="/supervisor/work-orders?isActive=true"
          cta={t('supervisorDashboard.cards.activeWorkOrders.cta')}
          valueColor={activeWorkOrdersCount > 0 ? C.norm : undefined}
        />
        <KpiCell
          label={t('supervisorDashboard.cards.pendingValidation.title')}
          value={pendingValidationWorkOrders.data?.total ?? 0}
          isLoading={pendingValidationWorkOrders.isLoading}
          href="/supervisor/validation-queue"
          cta={t('supervisorDashboard.cards.pendingValidation.cta')}
          valueColor={(pendingValidationWorkOrders.data?.total ?? 0) > 0 ? C.accent : undefined}
        />
        <KpiCell
          label={t('supervisorDashboard.cards.pendingReports.title')}
          value={(pendingReports.data?.total ?? 0) + (deferredReports.data?.total ?? 0)}
          isLoading={pendingReports.isLoading || deferredReports.isLoading}
          href="/supervisor/reports"
          cta={t('supervisorDashboard.cards.pendingReports.cta')}
          valueColor={((pendingReports.data?.total ?? 0) + (deferredReports.data?.total ?? 0)) > 0 ? C.high : undefined}
        />
      </div>

      {((overdueWorkOrders.data?.total ?? 0) > 0 || overdueWorkOrders.isLoading) && (
        <div style={{ ...SECTION_WRAP, borderColor: `${C.crit}66` }}>
          <SectionHeader
            label={`${t('supervisorDashboard.overduePanel.title', { count: overdueWorkOrders.data?.total ?? 0 })}`}
            right={<NavLink href="/supervisor/work-orders?isOverdue=true">{t('supervisorDashboard.overduePanel.viewAll')}</NavLink>}
          />
          {overdueWorkOrders.isLoading ? (
            <LoadingRow />
          ) : (
            <>
              {overdueWorkOrders.data?.data.map((wo) => (
                <OverdueRow key={wo.id} item={wo} />
              ))}
              {(overdueWorkOrders.data?.total ?? 0) > 5 && (
                <div style={{ padding: '6px 12px', borderTop: `1px solid ${C.border}` }}>
                  <Mono size={10} color={C.textTer} tracking="0.08em">
                    {t('supervisorDashboard.overduePanel.more', { count: (overdueWorkOrders.data?.total ?? 0) - 5 })}
                  </Mono>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <div style={SECTION_WRAP}>
          <SectionHeader label={t('supervisorDashboard.technicianLoad.title')} />
          {technicianLoad.isLoading ? (
            <LoadingRow />
          ) : techLoadItems.length === 0 ? (
            <EmptyRow text={t('supervisorDashboard.technicianLoad.none')} />
          ) : (
            techLoadItems.map((item) => (
              <TechnicianLoadRow key={item.technicianId} item={item} maxLoad={maxTechLoad} />
            ))
          )}
        </div>

        <div style={{ ...SECTION_WRAP, borderColor: assetHealthItems.length > 0 ? `${C.crit}55` : C.border }}>
          <SectionHeader label={t('supervisorDashboard.assetHealth.title')} />
          {assetHealth.isLoading ? (
            <LoadingRow />
          ) : assetHealthItems.length === 0 ? (
            <EmptyRow text={t('supervisorDashboard.assetHealth.none')} />
          ) : (
            assetHealthItems.map((item) => (
              <AssetHealthRow key={item.assetId} item={item} />
            ))
          )}
        </div>
      </div>

      <div>
        <Mono size={9} color={C.textTer} tracking="0.15em" block style={{ marginBottom: 10 }}>
          {t('supervisorDashboard.operational.title')}
        </Mono>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          <div style={SECTION_WRAP}>
            <SectionHeader
              label={t('supervisorDashboard.operational.closedToday.title')}
              right={
                (closedToday.data?.total ?? 0) > 0
                  ? <Mono size={12} color="var(--sb-text-on-rail)" weight={800} tracking="-0.01em">{formatCount(closedToday.data!.total)}</Mono>
                  : undefined
              }
            />
            {closedToday.isLoading ? (
              <LoadingRow />
            ) : !closedToday.data?.data.length ? (
              <EmptyRow text={t('supervisorDashboard.operational.closedToday.none')} />
            ) : (
              <>
                {closedToday.data.data.map((wo) => (
                  <ClosedTodayRow key={wo.id} item={wo} />
                ))}
                {(closedToday.data.total ?? 0) > 5 && (
                  <div style={{ padding: '6px 12px' }}>
                    <Mono size={10} color={C.textTer} tracking="0.08em">
                      {t('supervisorDashboard.operational.closedToday.more', { count: closedToday.data.total - 5 })}
                    </Mono>
                  </div>
                )}
              </>
            )}
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
              <Link
                href={`/supervisor/work-orders?status=${WorkOrderStatus.CLOSED}`}
                style={{ textDecoration: 'none' }}
              >
                <Mono size={9} color={C.norm} tracking="0.1em">
                  {t('supervisorDashboard.operational.closedToday.cta')} →
                </Mono>
              </Link>
            </div>
          </div>

          <div style={{ ...SECTION_WRAP, borderColor: blockedPartRequestsCount > 0 ? `${C.high}66` : C.border }}>
            <SectionHeader label={t('supervisorDashboard.operational.blockedPartRequests.title')} />
            <div style={{ padding: '16px 20px' }}>
              {pendingPartRequests.isLoading ? (
                <LoadingRow />
              ) : (
                <span style={{
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: blockedPartRequestsCount > 0 ? C.high : C.textTer,
                  lineHeight: 1,
                }}>
                  {formatCount(blockedPartRequestsCount)}
                </span>
              )}
              <div style={{ marginTop: 8 }}>
                <Mono size={10} color={C.textSec} tracking="0.08em">
                  {t('supervisorDashboard.operational.blockedPartRequests.description')}
                </Mono>
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
              <Link
                href={`/supervisor/work-orders?status=${WorkOrderStatus.ON_HOLD}`}
                style={{ textDecoration: 'none' }}
              >
                <Mono size={9} color={C.norm} tracking="0.1em">
                  {t('supervisorDashboard.operational.blockedPartRequests.cta')} →
                </Mono>
              </Link>
            </div>
          </div>

          <div style={{
            ...SECTION_WRAP,
            borderColor: expiredCount > 0 ? `${C.crit}55` : expiringSoonCount > 0 ? `${C.high}55` : C.border,
          }}>
            <SectionHeader
              label={t('supervisorDashboard.certAlerts.title')}
              right={
                (expiredCount + expiringSoonCount) > 0
                  ? <Mono size={10} color={expiredCount > 0 ? C.crit : C.high} weight={700} tracking="0.05em">{expiredCount + expiringSoonCount}</Mono>
                  : undefined
              }
            />
            {certAlerts.isLoading ? (
              <LoadingRow />
            ) : certAlertItems.length === 0 ? (
              <EmptyRow text={t('supervisorDashboard.certAlerts.none')} />
            ) : (
              <>
                {certAlertItems.slice(0, 4).map((item, i) => (
                  <CertAlertRow key={`${item.assetId}-${i}`} item={item} />
                ))}
                {certAlertItems.length > 4 && (
                  <div style={{ padding: '6px 12px' }}>
                    <Mono size={10} color={C.textTer} tracking="0.08em">
                      {t('supervisorDashboard.certAlerts.more', { count: certAlertItems.length - 4 })}
                    </Mono>
                  </div>
                )}
              </>
            )}
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
              <Link href="/supervisor/assets" style={{ textDecoration: 'none' }}>
                <Mono size={9} color={C.norm} tracking="0.1em">
                  {t('supervisorDashboard.certAlerts.cta')} →
                </Mono>
              </Link>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
