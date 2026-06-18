'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { inventoryApi } from '@/lib/inventory.api';
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

const CH = {
  done:   '#2E7A4E',
  active: '#B08B10',
  open:   '#4A7A9C',
  crit:   '#B53525',
  high:   '#A06020',
  accent: '#C49820',
} as const;

const DEFAULT_PERIOD_DAYS     = 30;
const DEFAULT_DEAD_STOCK_DAYS = 90;

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

  const [periodInput,    setPeriodInput]    = useState(String(DEFAULT_PERIOD_DAYS));
  const [deadStockInput, setDeadStockInput] = useState(String(DEFAULT_DEAD_STOCK_DAYS));
  const [periodDays,     setPeriodDays]     = useState(DEFAULT_PERIOD_DAYS);
  const [deadStockDays,  setDeadStockDays]  = useState(DEFAULT_DEAD_STOCK_DAYS);

  const queryParams = useMemo(
    () => ({ periodDays, deadStockDays }),
    [periodDays, deadStockDays],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'analytics', queryParams],
    queryFn: () => inventoryApi.getAnalytics(queryParams),
  });

  const handleApply = () => {
    const p = Math.max(1, Number.parseInt(periodInput,    10) || DEFAULT_PERIOD_DAYS);
    const d = Math.max(1, Number.parseInt(deadStockInput, 10) || DEFAULT_DEAD_STOCK_DAYS);
    setPeriodInput(String(p));
    setDeadStockInput(String(d));
    setPeriodDays(p);
    setDeadStockDays(d);
  };

  const handleReset = () => {
    setPeriodInput(String(DEFAULT_PERIOD_DAYS));
    setDeadStockInput(String(DEFAULT_DEAD_STOCK_DAYS));
    setPeriodDays(DEFAULT_PERIOD_DAYS);
    setDeadStockDays(DEFAULT_DEAD_STOCK_DAYS);
  };

  const topByQuantity = data?.consumption.topByQuantity ?? [];
  const topByCost     = data?.consumption.topByCost     ?? [];
  const replenishment = data?.replenishment             ?? [];
  const deadStock     = data?.deadStock                 ?? [];
  const costTrend     = data?.costTrend                 ?? [];

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

        </>
      )}
    </div>
  );
}
