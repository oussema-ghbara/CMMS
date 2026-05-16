'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Loader2 } from 'lucide-react';
import type { PartConsumptionBreakdown, UnitCostTrendPartEntry } from '@/lib/inventory.api';
import { inventoryApi } from '@/lib/inventory.api';
import { GaugeRing } from '@/components/ui/gauge-ring';
import { ChartBox } from '@/components/ui/chart-box';
import { Mono } from '@/components/ui/mono';

const C = {
  border:     'var(--sb-border)',
  surface:    'var(--sb-surface)',
  bg:         'var(--sb-bg)',
  textPrimary:'var(--sb-text-primary)',
  textSec:    'var(--sb-text-secondary)',
  textTer:    'var(--sb-text-tertiary)',
  done:       'var(--sb-s-done)',
  doneBg:     'var(--sb-s-done-bg)',
  active:     'var(--sb-s-active)',
  activeBg:   'var(--sb-s-active-bg)',
  wait:       'var(--sb-s-wait)',
  waitBg:     'var(--sb-s-wait-bg)',
  cancel:     'var(--sb-s-cancel)',
  cancelBg:   'var(--sb-s-cancel-bg)',
  open:       'var(--sb-s-open)',
  openBg:     'var(--sb-s-open-bg)',
  crit:       'var(--sb-p-crit)',
  critBg:     'var(--sb-p-crit-bg)',
  high:       'var(--sb-p-high)',
  highBg:     'var(--sb-p-high-bg)',
  accent:     'var(--sb-accent)',
} as const;

// Recharts SVG needs actual hex values — CSS variables don't resolve in SVG attributes
const CH = {
  done:   '#2E7A4E',
  active: '#B08B10',
  open:   '#4A7A9C',
  crit:   '#B53525',
  high:   '#A06020',
  accent: '#C49820',
} as const;

const DEFAULT_PERIOD_DAYS        = 30;
const DEFAULT_DEAD_STOCK_DAYS    = 90;
const DEFAULT_LONG_WAITING_HOURS = 24;

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
function fmtCur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}
function fmtPct(n: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`;
}
function trunc(s: string, max = 22): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const AXIS_STYLE = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  fill: '#9E9A95',
} as const;

const TH: React.CSSProperties = {
  padding: '0 12px 8px 0',
  textAlign: 'left',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 8,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--sb-text-tertiary)',
  fontWeight: 400,
  borderBottom: '1px solid var(--sb-border)',
  whiteSpace: 'nowrap',
};
const TH_R: React.CSSProperties = { ...TH, textAlign: 'right', paddingRight: 0 };
const TH_C: React.CSSProperties = { ...TH, textAlign: 'center' };

const TD: React.CSSProperties = {
  padding: '7px 12px 7px 0',
  fontSize: 12,
  color: 'var(--sb-text-primary)',
  borderBottom: '1px solid var(--sb-border)',
  verticalAlign: 'middle',
};
const TD_SEC: React.CSSProperties = { ...TD, color: 'var(--sb-text-secondary)' };
const TD_R: React.CSSProperties   = { ...TD, textAlign: 'right', paddingRight: 0 };
const TD_C: React.CSSProperties   = { ...TD, textAlign: 'center' };

const WO_TYPE_META: Record<string, { color: string; bg: string }> = {
  CORRECTIVE:   { color: '#B53525', bg: '#FDF0EE' },
  PREVENTIVE:   { color: '#3A6A8C', bg: '#EDF3F8' },
  IMPROVEMENT:  { color: '#8A8680', bg: '#F0EEEB' },
};

function KpiCell({
  title, value, variant,
}: { title: string; value: string; variant?: 'default' | 'warning' | 'danger' }) {
  const color = variant === 'danger' ? C.crit : variant === 'warning' ? C.high : C.textPrimary;
  return (
    <div style={{ border: `1px solid ${C.border}`, background: 'white', padding: '14px 16px' }}>
      <Mono size={9} color={C.textTer} tracking="0.13em" style={{ display: 'block', marginBottom: 8 }}>
        {title}
      </Mono>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function SectionBox({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: 'white' }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '8px 14px' }}>
        <Mono size={10} color={C.textSec} tracking="0.13em">{title}</Mono>
        {description && <div style={{ fontSize: 11, color: C.textTer, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function FilterGroup({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Mono size={9} color={C.textSec} tracking="0.10em">{label}</Mono>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 11,
          border: `1px solid ${C.border}`,
          background: 'white',
          color: C.textPrimary,
          padding: '4px 8px',
          width: 60,
          outline: 'none',
        }}
      />
    </div>
  );
}

interface ChartTooltipItem {
  value?: number | string;
  name?: string;
  color?: string;
}

function ChartTooltipContent({ active, payload, label }: {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#181613', border: '1px solid #2A2825', padding: '8px 12px' }}>
      {label && <Mono size={9} color="#7A7771" block style={{ marginBottom: 4 }}>{label}</Mono>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, fontWeight: 700, color: p.color ?? CH.accent }}>
            {typeof p.value === 'number' ? fmt(p.value) : p.value}
          </span>
          {p.name && <Mono size={8} color="#7A7771" tracking="0.08em">{p.name}</Mono>}
        </div>
      ))}
    </div>
  );
}

function ChartTooltipCur({ active, payload, label }: {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#181613', border: '1px solid #2A2825', padding: '8px 12px' }}>
      {label && <Mono size={9} color="#7A7771" block style={{ marginBottom: 4 }}>{label}</Mono>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, fontWeight: 700, color: p.color ?? CH.accent }}>
            {typeof p.value === 'number' ? fmtCur(p.value) : p.value}
          </span>
          {p.name && <Mono size={8} color="#7A7771" tracking="0.08em">{p.name}</Mono>}
        </div>
      ))}
    </div>
  );
}

export function StockAnalyticsBoard() {
  const { t } = useTranslation();

  const [periodInput,      setPeriodInput]      = useState(String(DEFAULT_PERIOD_DAYS));
  const [deadStockInput,   setDeadStockInput]   = useState(String(DEFAULT_DEAD_STOCK_DAYS));
  const [longWaitingInput, setLongWaitingInput] = useState(String(DEFAULT_LONG_WAITING_HOURS));
  const [periodDays,       setPeriodDays]       = useState(DEFAULT_PERIOD_DAYS);
  const [deadStockDays,    setDeadStockDays]    = useState(DEFAULT_DEAD_STOCK_DAYS);
  const [longWaitingThresholdHours, setLongWaitingThresholdHours] = useState(DEFAULT_LONG_WAITING_HOURS);

  const queryParams = useMemo(
    () => ({ periodDays, deadStockDays, longWaitingThresholdHours }),
    [periodDays, deadStockDays, longWaitingThresholdHours],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'analytics', queryParams],
    queryFn: () => inventoryApi.getAnalytics(queryParams),
  });

  const handleApply = () => {
    const p = Math.max(1, Number.parseInt(periodInput,      10) || DEFAULT_PERIOD_DAYS);
    const d = Math.max(1, Number.parseInt(deadStockInput,   10) || DEFAULT_DEAD_STOCK_DAYS);
    const l = Math.max(1, Number.parseInt(longWaitingInput, 10) || DEFAULT_LONG_WAITING_HOURS);
    setPeriodInput(String(p));
    setDeadStockInput(String(d));
    setLongWaitingInput(String(l));
    setPeriodDays(p);
    setDeadStockDays(d);
    setLongWaitingThresholdHours(l);
  };

  const handleReset = () => {
    setPeriodInput(String(DEFAULT_PERIOD_DAYS));
    setDeadStockInput(String(DEFAULT_DEAD_STOCK_DAYS));
    setLongWaitingInput(String(DEFAULT_LONG_WAITING_HOURS));
    setPeriodDays(DEFAULT_PERIOD_DAYS);
    setDeadStockDays(DEFAULT_DEAD_STOCK_DAYS);
    setLongWaitingThresholdHours(DEFAULT_LONG_WAITING_HOURS);
  };

  const topByQuantity = data?.consumption.topByQuantity ?? [];
  const topByCost     = data?.consumption.topByCost     ?? [];
  const consumptionBreakdown: PartConsumptionBreakdown[] = data?.consumptionBreakdown ?? [];
  const replenishment        = data?.replenishment        ?? [];
  const deadStock            = data?.deadStock            ?? [];
  const costTrend            = data?.costTrend            ?? [];
  const longWaitingRequests  = data?.longWaitingRequests  ?? [];
  const unitCostTrendPerPart: UnitCostTrendPartEntry[] = data?.unitCostTrendPerPart ?? [];

  const reqFulfilled   = data?.requests.fulfilled           ?? 0;
  const reqPartial     = data?.requests.partiallyFulfilled  ?? 0;
  const reqRejected    = data?.requests.rejected            ?? 0;
  const reqPending     = data?.requests.pending             ?? 0;
  const reqTotal       = data?.requests.total               ?? 0;
  const fulfilmentRate = data?.requests.fulfilmentRate      ?? 0;
  const avgProcessing  = data?.requests.avgProcessingMinutes;

  const qtyChartData  = topByQuantity.map((r) => ({
    name: trunc(r.part?.name ?? t('storekeeperAnalytics.labels.unknownPart')),
    value: r.totalQuantity,
  }));
  const costChartData = topByCost.map((r) => ({
    name: trunc(r.part?.name ?? t('storekeeperAnalytics.labels.unknownPart')),
    value: r.totalCost,
  }));
  const trendChartData = costTrend.map((r) => ({ m: r.month, v: r.totalCost }));

  const applyBtnStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: `1px solid ${C.accent}`,
    background: C.accent,
    color: 'white',
    padding: '4px 14px',
    cursor: 'pointer',
  };
  const resetBtnStyle: React.CSSProperties = {
    ...applyBtnStyle,
    border: `1px solid ${C.border}`,
    background: 'transparent',
    color: C.textSec,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        padding: '10px 14px',
        border: `1px solid ${C.border}`,
        background: C.surface,
      }}>
        <FilterGroup
          label={t('storekeeperAnalytics.filters.periodDays')}
          value={periodInput}
          onChange={setPeriodInput}
        />
        <FilterGroup
          label={t('storekeeperAnalytics.filters.deadStockDays')}
          value={deadStockInput}
          onChange={setDeadStockInput}
        />
        <FilterGroup
          label={t('storekeeperAnalytics.filters.longWaitingHours')}
          value={longWaitingInput}
          onChange={setLongWaitingInput}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={applyBtnStyle} onClick={handleApply}>
            {t('storekeeperAnalytics.filters.apply')}
          </button>
          <button type="button" style={resetBtnStyle} onClick={handleReset}>
            {t('storekeeperAnalytics.filters.reset')}
          </button>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            display: 'inline-flex',
            background: C.openBg,
            border: `1px solid ${C.open}28`,
            borderRadius: 2,
            padding: '2px 8px',
          }}>
            <Mono size={9} color={C.open} tracking="0.08em">
              {t('storekeeperAnalytics.labels.windowSummary', { periodDays, deadStockDays })}
            </Mono>
          </span>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          border: `1px solid ${C.crit}28`,
          background: C.critBg,
        }}>
          <AlertTriangle style={{ width: 14, height: 14, color: C.crit, flexShrink: 0 }} />
          <Mono size={10} color={C.crit} tracking="0.10em">{t('storekeeperAnalytics.states.error')}</Mono>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCell
          title={t('storekeeperAnalytics.kpi.totalRequests')}
          value={isLoading ? '…' : fmt(reqTotal)}
        />
        <KpiCell
          title={t('storekeeperAnalytics.kpi.fulfilmentRate')}
          value={isLoading ? '…' : fmtPct(fulfilmentRate)}
          variant={!isLoading && fulfilmentRate < 70 ? 'danger' : !isLoading && fulfilmentRate < 85 ? 'warning' : 'default'}
        />
        <KpiCell
          title={t('storekeeperAnalytics.kpi.avgProcessingMinutes')}
          value={isLoading ? '…' : avgProcessing == null ? '—' : fmt(avgProcessing)}
        />
        <KpiCell
          title={t('storekeeperAnalytics.kpi.deadStockCount')}
          value={isLoading ? '…' : fmt(deadStock.length)}
          variant={!isLoading && deadStock.length > 0 ? 'warning' : 'default'}
        />
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 8 }}>
          <Loader2 style={{ width: 16, height: 16, color: C.textTer, animation: 'spin 1s linear infinite' }} />
          <Mono size={11} color={C.textTer} tracking="0.12em">CHARGEMENT…</Mono>
        </div>
      ) : (
        <>
          {/* Top consumption charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ChartBox title={t('storekeeperAnalytics.sections.topConsumption').toUpperCase()}>
              {qtyChartData.length === 0 ? (
                <div style={{ padding: '14px 16px' }}>
                  <Mono size={9} color={C.textTer} tracking="0.10em">{t('storekeeperAnalytics.states.empty').toUpperCase()}</Mono>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, qtyChartData.length * 30)}>
                  <BarChart data={qtyChartData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="#DDE0E5" strokeDasharray="3 3" />
                    <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={118} />
                    <Tooltip content={<ChartTooltipContent />} cursor={{ fill: '#F1F2F4' }} />
                    <Bar dataKey="value" name={t('storekeeperAnalytics.columns.quantity')} fill={CH.open} radius={0} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartBox>

            <ChartBox title={t('storekeeperAnalytics.sections.topCost').toUpperCase()}>
              {costChartData.length === 0 ? (
                <div style={{ padding: '14px 16px' }}>
                  <Mono size={9} color={C.textTer} tracking="0.10em">{t('storekeeperAnalytics.states.empty').toUpperCase()}</Mono>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, costChartData.length * 30)}>
                  <BarChart data={costChartData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="#DDE0E5" strokeDasharray="3 3" />
                    <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={118} />
                    <Tooltip content={<ChartTooltipCur />} cursor={{ fill: '#F1F2F4' }} />
                    <Bar dataKey="value" name={t('storekeeperAnalytics.columns.cost')} fill={CH.active} radius={0} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartBox>
          </div>

          {/* Cost trend */}
          {trendChartData.length > 0 && (
            <ChartBox title={t('storekeeperAnalytics.sections.costTrend').toUpperCase()}>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trendChartData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="stockCostGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CH.active} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CH.active} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#DDE0E5" strokeDasharray="3 3" />
                  <XAxis dataKey="m" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => fmtCur(v)} />
                  <Tooltip content={<ChartTooltipCur />} />
                  <Area
                    type="monotone"
                    dataKey="v"
                    name={t('storekeeperAnalytics.columns.totalSpending')}
                    stroke={CH.active}
                    fill="url(#stockCostGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartBox>
          )}

          {/* Request breakdown */}
          <SectionBox
            title={t('storekeeperAnalytics.sections.requestBreakdown').toUpperCase()}
            description={t('storekeeperAnalytics.sections.requestBreakdownDescription')}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {([
                { key: 'fulfilled',         value: reqFulfilled, color: C.done,   bg: C.doneBg },
                { key: 'partiallyFulfilled', value: reqPartial,  color: C.active, bg: C.activeBg },
                { key: 'rejected',          value: reqRejected,  color: C.crit,   bg: C.critBg },
                { key: 'pending',           value: reqPending,   color: C.wait,   bg: C.waitBg },
              ] as const).map(({ key, value, color, bg }) => (
                <div key={key} style={{ border: `1px solid ${C.border}`, padding: '10px 12px', background: 'white' }}>
                  <Mono size={9} color={C.textTer} tracking="0.10em" style={{ display: 'block', marginBottom: 6 }}>
                    {t(`storekeeperAnalytics.requests.${key}`)}
                  </Mono>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color, lineHeight: 1 }}>
                    {fmt(value)}
                  </div>
                  {reqTotal > 0 && (
                    <div style={{ marginTop: 8, height: 3, background: C.surface }}>
                      <div style={{ height: '100%', background: color, width: `${(value / reqTotal) * 100}%`, opacity: 0.65 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionBox>

          {/* Replenishment */}
          {replenishment.length > 0 && (
            <SectionBox
              title={t('storekeeperAnalytics.sections.replenishment').toUpperCase()}
              description={t('storekeeperAnalytics.sections.replenishmentDescription')}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>{t('storekeeperAnalytics.columns.part')}</th>
                    <th style={TH}>{t('storekeeperAnalytics.columns.reference')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.timesTriggered')}</th>
                  </tr>
                </thead>
                <tbody>
                  {replenishment.map((row) => (
                    <tr key={row.partId}>
                      <td style={TD}>{row.partName}</td>
                      <td style={TD_SEC}>{row.partReference}</td>
                      <td style={TD_R}>
                        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, fontWeight: 700, color: C.textPrimary }}>
                          {fmt(row.timesTriggered)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionBox>
          )}

          {/* Dead stock */}
          {deadStock.length > 0 && (
            <SectionBox
              title={t('storekeeperAnalytics.sections.deadStock').toUpperCase()}
              description={t('storekeeperAnalytics.sections.deadStockDescription')}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>{t('storekeeperAnalytics.columns.part')}</th>
                    <th style={TH}>{t('storekeeperAnalytics.columns.reference')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.stock')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.minimum')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.unitCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStock.map((part) => (
                    <tr key={part.id}>
                      <td style={TD}>{part.name}</td>
                      <td style={TD_SEC}>{part.referenceCode}</td>
                      <td style={TD_R}>{fmt(part.currentStock)}</td>
                      <td style={TD_R}>{fmt(part.minimumStockThreshold)}</td>
                      <td style={TD_R}>{fmtCur(Number(part.unitCost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionBox>
          )}

          {/* Long-waiting requests */}
          {longWaitingRequests.length > 0 && (
            <SectionBox
              title={t('storekeeperAnalytics.sections.longWaitingRequests').toUpperCase()}
              description={t('storekeeperAnalytics.sections.longWaitingRequestsDescription', {
                hours: data?.longWaitingThresholdHours ?? longWaitingThresholdHours,
              })}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', marginBottom: 12,
                background: C.highBg,
                border: `1px solid ${C.high}40`,
              }}>
                <AlertTriangle style={{ width: 12, height: 12, color: C.high, flexShrink: 0 }} />
                <Mono size={9} color={C.high} tracking="0.08em">
                  {t('storekeeperAnalytics.labels.longWaitingWarning', {
                    count: longWaitingRequests.length,
                    hours: data?.longWaitingThresholdHours ?? longWaitingThresholdHours,
                  })}
                </Mono>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>{t('storekeeperAnalytics.columns.workOrder')}</th>
                    <th style={TH}>{t('storekeeperAnalytics.columns.part')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.quantity')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.waitingHours')}</th>
                  </tr>
                </thead>
                <tbody>
                  {longWaitingRequests.map((req) => (
                    <tr key={req.id}>
                      <td style={{ ...TD_SEC, fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>
                        {req.woReference}
                      </td>
                      <td style={TD}>
                        {req.partName ?? req.offCatalogDescription ?? t('storekeeperAnalytics.labels.offCatalog')}
                        {req.partReference && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: C.textTer }}>({req.partReference})</span>
                        )}
                      </td>
                      <td style={TD_R}>{fmt(req.quantityRequested)}</td>
                      <td style={TD_R}>
                        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, fontWeight: 700, color: C.crit }}>
                          {fmt(req.waitingHours)} h
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionBox>
          )}

          {/* Stock accuracy */}
          {data?.stockAccuracy && data.stockAccuracy.totalMovements > 0 && (() => {
            const acc = data.stockAccuracy;
            const accColor = acc.globalRate < 80 ? '#B53525' : acc.globalRate < 95 ? '#A06020' : '#2E7A4E';
            return (
              <SectionBox
                title={t('storekeeperAnalytics.sections.stockAccuracy').toUpperCase()}
                description={t('storekeeperAnalytics.sections.stockAccuracyDescription')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: acc.perPart.length > 0 ? 20 : 0 }}>
                  <GaugeRing value={acc.globalRate} max={100} color={accColor} size={88} unit="%" />
                  <div>
                    <Mono size={9} color={C.textTer} tracking="0.10em" block style={{ marginBottom: 4 }}>
                      {t('storekeeperAnalytics.states.globalAccuracyRate')}
                    </Mono>
                    <div style={{ fontSize: 26, fontWeight: 800, color: accColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {fmtPct(acc.globalRate)}
                    </div>
                    <Mono size={9} color={C.textTer} tracking="0.08em" block style={{ marginTop: 6 }}>
                      {t('storekeeperAnalytics.states.globalAccuracyDetail', {
                        adjustments: acc.adjustmentCount,
                        total: acc.totalMovements,
                      })}
                    </Mono>
                  </div>
                </div>

                {acc.perPart.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={TH}>{t('storekeeperAnalytics.columns.part')}</th>
                        <th style={TH}>{t('storekeeperAnalytics.columns.reference')}</th>
                        <th style={TH_R}>{t('storekeeperAnalytics.columns.totalMovements')}</th>
                        <th style={TH_R}>{t('storekeeperAnalytics.columns.adjustments')}</th>
                        <th style={TH_R}>{t('storekeeperAnalytics.columns.accuracyRate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acc.perPart.map((entry) => {
                        const ec = entry.accuracyRate < 80 ? '#B53525' : entry.accuracyRate < 95 ? '#A06020' : '#2E7A4E';
                        const eb = entry.accuracyRate < 80 ? '#FDF0EE' : entry.accuracyRate < 95 ? '#FDF5E8' : '#EAF5EF';
                        return (
                          <tr key={entry.partId}>
                            <td style={TD}>{entry.partName}</td>
                            <td style={{ ...TD_SEC, fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>
                              {entry.partReference}
                            </td>
                            <td style={TD_R}>{fmt(entry.totalMovements)}</td>
                            <td style={TD_R}>{fmt(entry.adjustmentMovements)}</td>
                            <td style={TD_R}>
                              <span style={{
                                display: 'inline-block',
                                background: eb,
                                border: `1px solid ${ec}28`,
                                borderRadius: 2,
                                padding: '1px 6px',
                                fontFamily: 'ui-monospace,monospace',
                                fontSize: 9,
                                fontWeight: 700,
                                color: ec,
                                letterSpacing: '0.08em',
                              }}>
                                {fmtPct(entry.accuracyRate)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </SectionBox>
            );
          })()}

          {/* Consumption breakdown */}
          {consumptionBreakdown.length > 0 && (
            <SectionBox
              title={t('storekeeperAnalytics.sections.consumptionBreakdown').toUpperCase()}
              description={t('storekeeperAnalytics.sections.consumptionBreakdownDescription')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {consumptionBreakdown.map((part) => (
                  <div key={part.partId} style={{ border: `1px solid ${C.border}` }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 12px', background: C.surface, borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>{part.partName}</span>
                      <Mono size={9} color={C.textTer} tracking="0.08em">{part.partReference}</Mono>
                    </div>
                    <div style={{ padding: '0 12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={TH}>{t('storekeeperAnalytics.columns.assetCategory')}</th>
                            <th style={TH}>{t('storekeeperAnalytics.columns.woType')}</th>
                            <th style={TH_R}>{t('storekeeperAnalytics.columns.quantity')}</th>
                            <th style={TH_R}>{t('storekeeperAnalytics.columns.cost')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {part.byAssetCategory.flatMap((cat) =>
                            cat.byWoType.map((entry, idx) => {
                              const meta = WO_TYPE_META[entry.woType ?? ''] ?? { color: C.textTer, bg: C.surface };
                              return (
                                <tr key={`${cat.categoryId ?? 'none'}-${entry.woType ?? 'none'}-${idx}`}>
                                  {idx === 0 ? (
                                    <td
                                      rowSpan={cat.byWoType.length}
                                      style={{ ...TD, verticalAlign: 'top', paddingTop: 10, fontWeight: 500 }}
                                    >
                                      {cat.categoryName ?? t('storekeeperAnalytics.labels.noCategory')}
                                    </td>
                                  ) : null}
                                  <td style={TD}>
                                    <span style={{
                                      display: 'inline-block',
                                      background: meta.bg,
                                      border: `1px solid ${meta.color}28`,
                                      borderRadius: 2,
                                      padding: '1px 6px',
                                      fontFamily: 'ui-monospace,monospace',
                                      fontSize: 9,
                                      fontWeight: 700,
                                      color: meta.color,
                                      letterSpacing: '0.08em',
                                    }}>
                                      {entry.woType
                                        ? t(`storekeeperAnalytics.labels.woType.${entry.woType}`)
                                        : t('storekeeperAnalytics.labels.woType.NONE')}
                                    </span>
                                  </td>
                                  <td style={TD_R}>{fmt(entry.quantity)}</td>
                                  <td style={TD_R}>{fmtCur(entry.cost)}</td>
                                </tr>
                              );
                            }),
                          )}
                          <tr>
                            <td
                              colSpan={2}
                              style={{ ...TD_SEC, fontWeight: 600, fontSize: 11, background: C.surface, borderBottom: 'none' }}
                            >
                              {t('storekeeperAnalytics.labels.total').toUpperCase()}
                            </td>
                            <td style={{ ...TD_R, fontWeight: 700, background: C.surface, borderBottom: 'none' }}>
                              {fmt(part.totalQuantity)}
                            </td>
                            <td style={{ ...TD_R, fontWeight: 700, background: C.surface, borderBottom: 'none' }}>
                              {fmtCur(part.totalCost)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </SectionBox>
          )}

          {/* Unit cost trend per part */}
          {unitCostTrendPerPart.length > 0 && (
            <SectionBox
              title={t('storekeeperAnalytics.sections.unitCostTrend').toUpperCase()}
              description={t('storekeeperAnalytics.sections.unitCostTrendDescription')}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>{t('storekeeperAnalytics.columns.part')}</th>
                    <th style={TH}>{t('storekeeperAnalytics.columns.reference')}</th>
                    <th style={TH}>{t('storekeeperAnalytics.columns.firstMonth')}</th>
                    <th style={TH_R}>{`${t('storekeeperAnalytics.columns.avgUnitCost')} (début)`}</th>
                    <th style={TH}>{t('storekeeperAnalytics.columns.lastMonth')}</th>
                    <th style={TH_R}>{`${t('storekeeperAnalytics.columns.avgUnitCost')} (fin)`}</th>
                    <th style={TH_C}>{t('storekeeperAnalytics.columns.trend')}</th>
                    <th style={TH_R}>{t('storekeeperAnalytics.columns.monthsTracked')}</th>
                  </tr>
                </thead>
                <tbody>
                  {unitCostTrendPerPart.map((entry) => {
                    const first = entry.trend[0];
                    const last  = entry.trend[entry.trend.length - 1];
                    const delta = last.avgUnitCost - first.avgUnitCost;
                    const TrendIcon   = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : ArrowRight;
                    const trendColor  = delta > 0 ? C.crit : delta < 0 ? C.done : C.textTer;
                    return (
                      <tr key={entry.partId}>
                        <td style={{ ...TD, fontWeight: 500 }}>{entry.partName}</td>
                        <td style={{ ...TD_SEC, fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>
                          {entry.partReference}
                        </td>
                        <td style={TD_SEC}>{first.month}</td>
                        <td style={TD_R}>{fmtCur(first.avgUnitCost)}</td>
                        <td style={TD_SEC}>{last.month}</td>
                        <td style={{ ...TD_R, fontWeight: 600 }}>{fmtCur(last.avgUnitCost)}</td>
                        <td style={TD_C}>
                          <TrendIcon style={{ width: 14, height: 14, color: trendColor, display: 'inline-block' }} />
                        </td>
                        <td style={TD_R}>{entry.trend.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </SectionBox>
          )}
        </>
      )}
    </div>
  );
}
