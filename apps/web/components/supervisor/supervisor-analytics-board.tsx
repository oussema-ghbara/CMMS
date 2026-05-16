'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  Cell, CartesianGrid,
} from 'recharts';
import { Download, Loader2 } from 'lucide-react';
import { WorkOrderStatus, WorkOrderType, WorkOrderPriority } from '@gmao/shared';
import {
  workOrdersApi,
  type TechnicianKpiItem,
  type AssetBreakdownItem,
  type PlanComplianceEntry,
  type ChecklistItemAnomalyEntry,
} from '@/lib/work-orders.api';
import { categoriesApi } from '@/lib/categories.api';
import { toast } from 'sonner';
import { GaugeRing } from '@/components/ui/gauge-ring';
import { ChartBox } from '@/components/ui/chart-box';
import { Mono } from '@/components/ui/mono';

const DEFAULT_PERIOD_DAYS = 30;

type AnalyticsTab = 'overview' | 'assets' | 'technicians' | 'preventive' | 'requester' | 'operational';

const C = {
  active:  '#B08B10',
  open:    '#4A7A9C',
  done:    '#2E7A4E',
  wait:    '#7A6020',
  cancel:  '#8A8680',
  crit:    '#B53525',
  high:    '#A06020',
  norm:    '#3A6A8C',
  low:     '#8A8680',
  accent:  '#C49820',
  border:  '#DDE0E5',
  textSec: '#6B6863',
  textTer: '#9E9A95',
} as const;

const RADAR_COLORS = [C.norm, C.active, C.crit, C.done, C.wait, C.high, C.cancel, C.accent];

const STATUS_ORDER: WorkOrderStatus[] = [
  WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD, WorkOrderStatus.PENDING_VALIDATION,
  WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED, WorkOrderStatus.DRAFT,
];
const PRIORITY_ORDER: WorkOrderPriority[] = [
  WorkOrderPriority.CRITICAL, WorkOrderPriority.HIGH, WorkOrderPriority.MEDIUM, WorkOrderPriority.LOW,
];

const STATUS_CHART_COLOR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:               C.cancel,
  [WorkOrderStatus.OPEN]:                C.open,
  [WorkOrderStatus.ASSIGNED]:            C.active,
  [WorkOrderStatus.IN_PROGRESS]:         C.active,
  [WorkOrderStatus.ON_HOLD]:             C.wait,
  [WorkOrderStatus.PENDING_VALIDATION]:  C.wait,
  [WorkOrderStatus.CLOSED]:              C.done,
  [WorkOrderStatus.CANCELLED]:           C.cancel,
};

const STATUS_LABEL_SHORT: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:               'BROUILLON',
  [WorkOrderStatus.OPEN]:                'OUVERT',
  [WorkOrderStatus.ASSIGNED]:            'ASSIGNÉ',
  [WorkOrderStatus.IN_PROGRESS]:         'EN COURS',
  [WorkOrderStatus.ON_HOLD]:             'ATTENTE',
  [WorkOrderStatus.PENDING_VALIDATION]:  'VALIDATION',
  [WorkOrderStatus.CLOSED]:              'TERMINÉ',
  [WorkOrderStatus.CANCELLED]:           'ANNULÉ',
};

const PRIORITY_CHART_COLOR: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: C.crit,
  [WorkOrderPriority.HIGH]:     C.high,
  [WorkOrderPriority.MEDIUM]:   C.norm,
  [WorkOrderPriority.LOW]:      C.low,
};

const PRIORITY_LABEL_SHORT: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'CRITIQUE',
  [WorkOrderPriority.HIGH]:     'HAUTE',
  [WorkOrderPriority.MEDIUM]:   'NORMALE',
  [WorkOrderPriority.LOW]:      'BASSE',
};

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

export function buildAnalyticsExportFileName(periodDays: number, now = new Date()): string {
  const datePart = now.toISOString().slice(0, 10);
  return `supervisor-analytics-${periodDays}d-${datePart}.pdf`;
}

export async function exportAnalyticsPdf(
  params: { periodDays: number; categoryId?: string },
  now = new Date(),
) {
  const pdfBlob = await workOrdersApi.exportAnalyticsPdf(params);
  const objectUrl = window.URL.createObjectURL(pdfBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = buildAnalyticsExportFileName(params.periodDays, now);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(objectUrl);
}

// ── Design-system inline components ──────────────────────────────────────────

function KpiMetric({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <div style={{ border: '1px solid var(--sb-border)', padding: '16px 20px', background: 'var(--sb-bg)' }}>
      <Mono size={9} color="var(--sb-text-secondary)" tracking="0.12em" block>
        {label}
      </Mono>
      <div style={{
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: 'var(--sb-text-primary)',
        lineHeight: 1,
        marginTop: 8,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      }}>
        {value ?? '—'}
      </div>
      {sub && (
        <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.10em" block style={{ marginTop: 6 }}>
          {sub}
        </Mono>
      )}
    </div>
  );
}

function RateBadge({ rate, threshold = 0.8 }: { rate: number | null; threshold?: number }) {
  const good = rate != null && rate >= threshold;
  const neutral = rate == null;
  return (
    <span style={{
      display: 'inline-block',
      background: neutral ? 'var(--sb-surface)' : good ? 'var(--sb-s-done-bg)' : 'var(--sb-p-crit-bg)',
      border: `1px solid ${neutral ? 'var(--sb-border)' : good ? 'rgba(46,122,78,0.28)' : 'rgba(181,53,37,0.28)'}`,
      borderRadius: 2, padding: '1px 6px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 9, fontWeight: 700,
      color: neutral ? 'var(--sb-text-tertiary)' : good ? 'var(--sb-s-done)' : 'var(--sb-p-crit)',
      letterSpacing: '0.08em',
    }}>
      {rate != null ? fmtPct(rate) : '—'}
    </span>
  );
}

function AnomalyBadge({ rate }: { rate: number | null }) {
  const isHigh = rate != null && rate > 0.2;
  const isMedium = rate != null && rate > 0;
  return (
    <span style={{
      display: 'inline-block',
      background: isHigh ? 'var(--sb-p-crit-bg)' : isMedium ? 'var(--sb-p-high-bg)' : 'var(--sb-surface)',
      border: `1px solid ${isHigh ? 'rgba(181,53,37,0.28)' : isMedium ? 'rgba(160,96,32,0.28)' : 'var(--sb-border)'}`,
      borderRadius: 2, padding: '1px 6px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 9, fontWeight: 700,
      color: isHigh ? 'var(--sb-p-crit)' : isMedium ? 'var(--sb-p-high)' : 'var(--sb-text-tertiary)',
      letterSpacing: '0.08em',
    }}>
      {rate != null ? fmtPct(rate) : '—'}
    </span>
  );
}

function FailureBadge({ count }: { count: number }) {
  return (
    <span style={{
      display: 'inline-block',
      background: count >= 5 ? 'var(--sb-p-crit-bg)' : count > 0 ? 'var(--sb-p-high-bg)' : 'var(--sb-surface)',
      border: `1px solid ${count >= 5 ? 'rgba(181,53,37,0.28)' : count > 0 ? 'rgba(160,96,32,0.28)' : 'var(--sb-border)'}`,
      borderRadius: 2, padding: '1px 6px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 9, fontWeight: 700,
      color: count >= 5 ? 'var(--sb-p-crit)' : count > 0 ? 'var(--sb-p-high)' : 'var(--sb-text-tertiary)',
      letterSpacing: '0.08em',
    }}>
      {count}
    </span>
  );
}

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
const TD_R: React.CSSProperties = { ...TD, textAlign: 'right', paddingRight: 0 };
const TD_C: React.CSSProperties = { ...TD, textAlign: 'center' };

// ── Chart primitives ──────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  value: number | string;
  name?: string;
  color?: string;
}

function ChartTooltipContent({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1A1816', border: '1px solid #3A3630', borderRadius: 2, padding: '8px 12px' }}>
      {label && (
        <Mono size={9} color="#9E9A95" tracking="0.10em" block style={{ marginBottom: 4 }}>
          {label}
        </Mono>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 12, color: p.color ?? '#E8E5E0' }}>
          {p.name ? `${p.name}: ` : ''}{p.value}
        </div>
      ))}
    </div>
  );
}

function StatusDistributionChart({ entries }: { entries: Array<{ status: WorkOrderStatus; count: number }> }) {
  const data = entries.map((e) => ({
    name: STATUS_LABEL_SHORT[e.status],
    count: e.count,
    color: STATUS_CHART_COLOR[e.status],
  }));
  return (
    <ChartBox title="DISTRIBUTION — STATUTS">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={C.border} />
          <XAxis type="number" tick={{ fontSize: 10, fill: C.textSec, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: C.textSec, fontFamily: 'monospace' }} width={72} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={0} barSize={14}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function PriorityDistributionChart({ entries }: { entries: Array<{ priority: WorkOrderPriority; count: number }> }) {
  const data = entries.map((e) => ({
    name: PRIORITY_LABEL_SHORT[e.priority],
    count: e.count,
    color: PRIORITY_CHART_COLOR[e.priority],
  }));
  return (
    <ChartBox title="DISTRIBUTION — PRIORITÉS">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.border} />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.textSec, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: C.textSec, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="count" radius={0} barSize={40}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function AssetReliabilityChart({ items }: { items: AssetBreakdownItem[] }) {
  const data = items
    .filter((i) => i.failureCount > 0 && i.mttrHours != null)
    .map((i) => ({ x: i.failureCount, y: i.mttrHours!, z: Math.max(i.totalCost, 1), name: i.assetName }));

  if (data.length === 0) return null;

  return (
    <ChartBox title="FIABILITÉ ACTIFS — PANNES × MTTR (taille = coût)">
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ left: 8, right: 24, top: 8, bottom: 16 }}>
          <CartesianGrid stroke={C.border} />
          <XAxis
            type="number" dataKey="x" name="Pannes"
            tick={{ fontSize: 10, fill: C.textSec, fontFamily: 'monospace' }}
            label={{ value: 'PANNES', position: 'insideBottom', offset: -8, fontSize: 9, fill: C.textSec, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            type="number" dataKey="y" name="MTTR (h)"
            tick={{ fontSize: 10, fill: C.textSec, fontFamily: 'monospace' }}
            label={{ value: 'MTTR (H)', angle: -90, position: 'insideLeft', offset: 8, fontSize: 9, fill: C.textSec, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false}
          />
          <ZAxis type="number" dataKey="z" range={[40, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { name: string; x: number; y: number; z: number };
              return (
                <div style={{ background: '#1A1816', border: '1px solid #3A3630', borderRadius: 2, padding: '8px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#E8E5E0', marginBottom: 4 }}>{d.name}</div>
                  <Mono size={9} color="#9E9A95" block>
                    Pannes: {d.x} · MTTR: {fmtDec(d.y)} h · Coût: {fmtCur(d.z)}
                  </Mono>
                </div>
              );
            }}
          />
          <Scatter data={data} fill={C.norm} opacity={0.85} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function TechnicianRadarChart({ items }: { items: TechnicianKpiItem[] }) {
  const visibleItems = items.slice(0, 6);
  if (visibleItems.length === 0) return null;

  const maxClosed = Math.max(...visibleItems.map((i) => i.closedCount), 1);
  const maxResp   = Math.max(...visibleItems.map((i) => i.avgResponseTimeHours ?? 0), 1);
  const maxDur    = Math.max(...visibleItems.map((i) => i.avgActiveDurationMinutes ?? 0), 1);

  const radarData = ['VOLUME', 'QUALITÉ', 'RAPIDITÉ', 'EFFICACITÉ'].map((metric) => {
    const entry: Record<string, string | number> = { metric };
    visibleItems.forEach((t) => {
      if (metric === 'VOLUME')     entry[t.name] = Math.round((t.closedCount / maxClosed) * 100);
      if (metric === 'QUALITÉ')    entry[t.name] = t.firstPassRate != null ? Math.round(t.firstPassRate * 100) : 0;
      if (metric === 'RAPIDITÉ')   entry[t.name] = t.avgResponseTimeHours != null ? Math.round((1 - t.avgResponseTimeHours / maxResp) * 100) : 0;
      if (metric === 'EFFICACITÉ') entry[t.name] = t.avgActiveDurationMinutes != null ? Math.round((1 - t.avgActiveDurationMinutes / maxDur) * 100) : 0;
    });
    return entry;
  });

  return (
    <ChartBox title="PERFORMANCE COMPARATIVE — RADAR (normalisé 0–100)">
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={radarData}>
          <PolarGrid stroke={C.border} />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: C.textSec, fontFamily: 'monospace' }} />
          {visibleItems.map((t, i) => (
            <Radar
              key={t.technicianId}
              name={t.name}
              dataKey={t.name}
              stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
              fill={RADAR_COLORS[i % RADAR_COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
          <Tooltip content={<ChartTooltipContent />} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

function TechnicianDurationChart({ items }: { items: TechnicianKpiItem[] }) {
  const data = items
    .filter((i) => i.avgActiveDurationMinutes != null)
    .map((i) => ({
      name: i.name.split(' ')[0],
      active: Math.round(i.avgActiveDurationMinutes!),
      response: i.avgResponseTimeHours != null ? Math.round(i.avgResponseTimeHours * 60) : 0,
    }));

  if (data.length === 0) return null;

  return (
    <ChartBox title="DURÉES MOYENNES PAR TECHNICIEN (MIN)">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.border} />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.textSec, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: C.textSec, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="active" name="Active" fill={C.norm} radius={0} barSize={16} />
          <Bar dataKey="response" name="Réponse" fill={C.active} radius={0} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

// ── Data table components ─────────────────────────────────────────────────────

function TechRow({ item }: { item: TechnicianKpiItem }) {
  const { t } = useTranslation();
  return (
    <tr style={{ borderBottom: '1px solid var(--sb-border)' }}>
      <td style={{ ...TD, fontWeight: 600 }}>{item.name}</td>
      <td style={TD_C}>{item.closedCount}</td>
      <td style={TD_C}>{item.firstPassRate !== null ? fmtPct(item.firstPassRate) : '—'}</td>
      <td style={TD_C}>
        {item.rejectionRate !== null ? (
          <span style={{
            color: item.rejectionRate > 0 ? 'var(--sb-p-crit)' : 'var(--sb-text-secondary)',
            fontWeight: item.rejectionRate > 0 ? 700 : 400,
          }}>
            {fmtPct(item.rejectionRate)}
          </span>
        ) : '—'}
      </td>
      <td style={TD_C}>{item.avgActiveDurationMinutes !== null ? `${fmtDec(item.avgActiveDurationMinutes)} min` : '—'}</td>
      <td style={TD_C}>{item.avgResponseTimeHours !== null ? `${fmtDec(item.avgResponseTimeHours)} h` : '—'}</td>
      <td style={{ ...TD_C, borderBottom: '1px solid var(--sb-border)' }}>
        {item.avgHoldPerWo !== null ? fmtDec(item.avgHoldPerWo) : '—'}
      </td>
    </tr>
  );
}

function PlanComplianceTable({ entries }: { entries: PlanComplianceEntry[] }) {
  const { t } = useTranslation();
  return (
    <ChartBox title={t('supervisorAnalytics.sections.compliancePerPlan')}>
      {entries.length === 0 ? (
        <div style={{ padding: '14px 16px' }}>
          <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
        </div>
      ) : (
        <div style={{ padding: '0 16px 12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>{t('supervisorAnalytics.columns.plan')}</th>
                <th style={TH_R}>{t('supervisorAnalytics.columns.total')}</th>
                <th style={TH_R}>{t('supervisorAnalytics.columns.closedOnTime')}</th>
                <th style={TH_R}>{t('supervisorAnalytics.columns.complianceRate')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.planId} style={{ borderBottom: '1px solid var(--sb-border)' }}>
                  <td style={{ ...TD, fontWeight: 600 }}>{row.planTitle}</td>
                  <td style={TD_R}>{fmt(row.total)}</td>
                  <td style={TD_R}>{fmt(row.closedOnTime)}</td>
                  <td style={TD_R}>
                    <RateBadge rate={row.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartBox>
  );
}

function ChecklistItemAnomalyTable({ entries }: { entries: ChecklistItemAnomalyEntry[] }) {
  const { t } = useTranslation();
  return (
    <ChartBox title={t('supervisorAnalytics.sections.anomalyPerChecklistItem')}>
      {entries.length === 0 ? (
        <div style={{ padding: '14px 16px' }}>
          <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
        </div>
      ) : (
        <div style={{ padding: '0 16px 12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>{t('supervisorAnalytics.columns.checklistItem')}</th>
                <th style={TH_R}>{t('supervisorAnalytics.columns.executions')}</th>
                <th style={TH_R}>{t('supervisorAnalytics.columns.anomalies')}</th>
                <th style={TH_R}>{t('supervisorAnalytics.columns.anomalyRate')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.itemId} style={{ borderBottom: '1px solid var(--sb-border)' }}>
                  <td style={{ ...TD, fontWeight: 600 }}>{row.description}</td>
                  <td style={TD_R}>{fmt(row.total)}</td>
                  <td style={TD_R}>{fmt(row.anomalyCount)}</td>
                  <td style={TD_R}>
                    <AnomalyBadge rate={row.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartBox>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const filterSelectStyle: React.CSSProperties = {
  height: 26,
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  padding: '0 4px 0 8px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.08em',
  color: 'var(--sb-text-secondary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
};

const filterInputStyle: React.CSSProperties = {
  height: 26,
  width: 64,
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  padding: '0 8px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.06em',
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
};

export function SupervisorAnalyticsBoard() {
  const { t } = useTranslation();

  const [periodInput, setPeriodInput] = useState(String(DEFAULT_PERIOD_DAYS));
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [isExporting, setIsExporting] = useState(false);
  const [exportErrorKey, setExportErrorKey] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: categoriesApi.list,
  });

  const queryParams = useMemo(() => ({ periodDays, categoryId }), [periodDays, categoryId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'analytics', queryParams],
    queryFn: () => workOrdersApi.getAnalytics(queryParams),
  });

  const handleApply = () => {
    const parsed = Math.max(1, Number.parseInt(periodInput, 10) || DEFAULT_PERIOD_DAYS);
    setPeriodInput(String(parsed));
    setPeriodDays(parsed);
  };

  const handleReset = () => {
    setPeriodInput(String(DEFAULT_PERIOD_DAYS));
    setPeriodDays(DEFAULT_PERIOD_DAYS);
    setCategoryId(undefined);
  };

  const handleExportPdf = async () => {
    setExportErrorKey(null);
    setIsExporting(true);
    try {
      await exportAnalyticsPdf({ periodDays, ...(categoryId ? { categoryId } : {}) });
      toast.success(t('supervisorAnalytics.export.success'));
    } catch {
      setExportErrorKey('supervisorAnalytics.export.error');
    } finally {
      setIsExporting(false);
    }
  };

  const summary = data?.summary;
  const byStatus = data?.byStatus ?? {};
  const byType = data?.byType ?? {};
  const byPriority = data?.byPriority ?? {};

  const statusEntries = STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0).map((s) => ({ status: s, count: byStatus[s] ?? 0 }));
  const priorityEntries = PRIORITY_ORDER.filter((p) => (byPriority[p] ?? 0) > 0).map((p) => ({ priority: p, count: byPriority[p] ?? 0 }));
  const correctiveCount = byType[WorkOrderType.CORRECTIVE] ?? 0;
  const preventiveCount = byType[WorkOrderType.PREVENTIVE] ?? 0;

  const avgFirstPassRate = useMemo(() => {
    if (!data?.technicianKpis.length) return null;
    const rates = data.technicianKpis.map((t) => t.firstPassRate).filter((r): r is number => r !== null);
    if (!rates.length) return null;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }, [data?.technicianKpis]);

  const TABS: { key: AnalyticsTab; labelKey: string }[] = [
    { key: 'overview',    labelKey: 'supervisorAnalytics.tabs.overview' },
    { key: 'assets',      labelKey: 'supervisorAnalytics.tabs.assets' },
    { key: 'technicians', labelKey: 'supervisorAnalytics.tabs.technicians' },
    { key: 'preventive',  labelKey: 'supervisorAnalytics.tabs.preventive' },
    { key: 'requester',   labelKey: 'supervisorAnalytics.tabs.requester' },
    { key: 'operational', labelKey: 'supervisorAnalytics.tabs.operational' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Filter toolbar ── */}
      <div style={{
        minHeight: 44,
        background: 'var(--sb-surface)',
        border: '1px solid var(--sb-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}>
        <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.filters.periodDays')}</Mono>
        <input
          type="number"
          min={1}
          max={365}
          value={periodInput}
          onChange={(e) => setPeriodInput(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterInputStyle}
        />

        {categories.length > 0 && (
          <>
            <div style={{ width: 1, height: 14, background: 'var(--sb-border)', flexShrink: 0 }} />
            <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.filters.category')}</Mono>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || undefined)}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              style={filterSelectStyle}
            >
              <option value="">{t('supervisorAnalytics.filters.allCategories')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </>
        )}

        <div style={{ width: 1, height: 14, background: 'var(--sb-border)', flexShrink: 0 }} />

        <button
          type="button"
          onClick={handleApply}
          style={{
            height: 26,
            background: 'var(--sb-text-primary)',
            border: 'none',
            color: 'var(--sb-bg)',
            padding: '0 12px',
            borderRadius: 2,
            cursor: 'pointer',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {t('supervisorAnalytics.filters.apply')}
        </button>

        <button
          type="button"
          onClick={handleReset}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 9,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--sb-text-tertiary)',
            padding: '0 2px',
          }}
        >
          {t('supervisorAnalytics.filters.reset')}
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => { void handleExportPdf(); }}
          disabled={isExporting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 26,
            background: 'transparent',
            border: '1px solid var(--sb-border-strong)',
            color: isExporting ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
            padding: '0 12px',
            borderRadius: 2,
            cursor: isExporting ? 'default' : 'pointer',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 9,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            fontWeight: 500,
            opacity: isExporting ? 0.6 : 1,
          }}
        >
          {isExporting
            ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            : <Download size={11} />}
          {isExporting ? t('supervisorAnalytics.export.loading') : t('supervisorAnalytics.export.action')}
        </button>
      </div>

      {/* ── Export error ── */}
      {exportErrorKey && (
        <div style={{
          border: '1px solid rgba(181,53,37,0.4)',
          background: 'var(--sb-p-crit-bg)',
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--sb-p-crit)',
          marginBottom: 16,
        }}>
          {t(exportErrorKey)}
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--sb-text-tertiary)' }} />
        </div>
      )}

      {/* ── Error ── */}
      {isError && !isLoading && (
        <div style={{
          border: '1px solid rgba(181,53,37,0.4)',
          background: 'var(--sb-p-crit-bg)',
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--sb-p-crit)',
        }}>
          {t('supervisorAnalytics.states.error')}
        </div>
      )}

      {/* ── Data ── */}
      {!isLoading && !isError && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            overflowX: 'auto',
            marginBottom: 20,
          }}>
            {TABS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '9px 14px',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === key ? 'var(--sb-text-primary)' : 'transparent'}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: activeTab === key ? 'var(--sb-text-primary)' : 'var(--sb-text-tertiary)',
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: 9,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  fontWeight: activeTab === key ? 600 : 400,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.totalWorkOrders')}
                  value={fmt(summary?.total ?? 0)}
                  sub={t('supervisorAnalytics.kpi.openWorkOrders', { count: summary?.open ?? 0 })}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.overdueWorkOrders')}
                  value={fmt(summary?.overdue ?? 0)}
                  sub={t('supervisorAnalytics.kpi.overdueDescription')}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.resolutionRate')}
                  value={summary?.resolutionRate != null ? fmtPct(summary.resolutionRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.closedThisPeriod', { count: summary?.closedThisPeriod ?? 0 })}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.avgResolutionDays')}
                  value={data.avgResolutionDays != null ? `${fmtDec(data.avgResolutionDays)} j` : '—'}
                  sub={t('supervisorAnalytics.kpi.avgResolutionDescription')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
                <div style={{ background: 'var(--sb-bg)', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <GaugeRing value={summary?.resolutionRate != null ? summary.resolutionRate * 100 : 0} max={100} color={C.done} size={88} unit="%" />
                  <Mono size={9} color="var(--sb-text-secondary)" tracking="0.12em">RÉSOLUTION</Mono>
                </div>
                <div style={{ background: 'var(--sb-bg)', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <GaugeRing value={avgFirstPassRate != null ? avgFirstPassRate * 100 : 0} max={100} color={C.active} size={88} unit="%" />
                  <Mono size={9} color="var(--sb-text-secondary)" tracking="0.12em">1ER PASSAGE</Mono>
                </div>
                <div style={{ background: 'var(--sb-bg)', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <GaugeRing value={data.assetKpis.preventiveComplianceRate != null ? data.assetKpis.preventiveComplianceRate * 100 : 0} max={100} color={C.norm} size={88} unit="%" />
                  <Mono size={9} color="var(--sb-text-secondary)" tracking="0.12em">CONFORMITÉ PRÉVENTIF</Mono>
                </div>
              </div>

              {(statusEntries.length > 0 || priorityEntries.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sb-border)' }}>
                  {statusEntries.length > 0 && <StatusDistributionChart entries={statusEntries} />}
                  {priorityEntries.length > 0 && <PriorityDistributionChart entries={priorityEntries} />}
                </div>
              )}

              {(correctiveCount > 0 || preventiveCount > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
                  <KpiMetric label={WorkOrderType.CORRECTIVE} value={fmt(correctiveCount)} />
                  <KpiMetric label={WorkOrderType.PREVENTIVE} value={fmt(preventiveCount)} />
                </div>
              )}
            </div>
          )}

          {/* ── Assets ── */}
          {activeTab === 'assets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.globalMtbf')}
                  value={data.assetKpis.globalMtbfDays != null ? `${fmtDec(data.assetKpis.globalMtbfDays)} j` : '—'}
                  sub={t('supervisorAnalytics.kpi.globalMtbfDesc')}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.globalMttr')}
                  value={data.assetKpis.globalMttrHours != null ? `${fmtDec(data.assetKpis.globalMttrHours)} h` : '—'}
                  sub={t('supervisorAnalytics.kpi.globalMttrDesc')}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.preventiveCompliance')}
                  value={data.assetKpis.preventiveComplianceRate != null ? fmtPct(data.assetKpis.preventiveComplianceRate) : '—'}
                  sub={`${data.preventivePlanEfficiency.closedPreventiveWOs} / ${data.preventivePlanEfficiency.totalPreventiveWOs}`}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.totalMaintenanceCost')}
                  value={fmtCur(data.assetKpis.totalMaintenanceCost)}
                  sub={t('supervisorAnalytics.kpi.totalMaintenanceCostDesc')}
                />
              </div>

              {data.assetKpis.perAsset.length > 0 && (
                <AssetReliabilityChart items={data.assetKpis.perAsset} />
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <ChartBox title={t('supervisorAnalytics.sections.topFailingAssets')}>
                  {data.assetKpis.topByFailureFrequency.length === 0 ? (
                    <div style={{ padding: '14px 16px' }}>
                      <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
                    </div>
                  ) : (
                    <div style={{ padding: '0 16px 12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={TH}>{t('supervisorAnalytics.columns.asset')}</th>
                            <th style={TH_C}>{t('supervisorAnalytics.columns.failureCount')}</th>
                            <th style={TH_R}>{t('supervisorAnalytics.columns.lastFailure')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.assetKpis.topByFailureFrequency.map((item) => (
                            <tr key={item.assetId} style={{ borderBottom: '1px solid var(--sb-border)' }}>
                              <td style={{ ...TD, fontWeight: 600 }}>{item.assetName}</td>
                              <td style={TD_C}>
                                <FailureBadge count={item.failureCount} />
                              </td>
                              <td style={{ ...TD_SEC, ...TD_R }}>
                                {new Date(item.lastFailureDate).toLocaleDateString('fr-FR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ChartBox>

                <ChartBox title={t('supervisorAnalytics.sections.topCostAssets')}>
                  {data.assetKpis.topByCost.length === 0 ? (
                    <div style={{ padding: '14px 16px' }}>
                      <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
                    </div>
                  ) : (
                    <div style={{ padding: '0 16px 12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={TH}>{t('supervisorAnalytics.columns.asset')}</th>
                            <th style={TH_R}>{t('supervisorAnalytics.columns.totalCost')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.assetKpis.topByCost.map((item) => (
                            <tr key={item.assetId} style={{ borderBottom: '1px solid var(--sb-border)' }}>
                              <td style={{ ...TD, fontWeight: 600 }}>{item.assetName}</td>
                              <td style={{ ...TD_R, fontWeight: 600 }}>{fmtCur(item.totalCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ChartBox>
              </div>

              {data.assetKpis.perAsset.length > 0 && (
                <ChartBox title={t('supervisorAnalytics.sections.perAssetBreakdown')}>
                  <div style={{ padding: '0 16px 12px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                      <thead>
                        <tr>
                          <th style={TH}>{t('supervisorAnalytics.columns.asset')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.failureCount')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.downtimeHours')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.mttrHours')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.mtbfDays')}</th>
                          <th style={TH_R}>{t('supervisorAnalytics.columns.totalCost')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.assetKpis.perAsset.map((item: AssetBreakdownItem) => (
                          <tr key={item.assetId} style={{ borderBottom: '1px solid var(--sb-border)' }}>
                            <td style={{ ...TD, fontWeight: 600 }}>{item.assetName}</td>
                            <td style={TD_C}>
                              {item.failureCount > 0
                                ? <FailureBadge count={item.failureCount} />
                                : <span style={{ color: 'var(--sb-text-tertiary)' }}>—</span>}
                            </td>
                            <td style={TD_C}>{item.downtimeHours > 0 ? `${fmtDec(item.downtimeHours)} h` : '—'}</td>
                            <td style={TD_C}>{item.mttrHours != null ? `${fmtDec(item.mttrHours)} h` : '—'}</td>
                            <td style={TD_C}>{item.mtbfDays != null ? `${fmtDec(item.mtbfDays)} j` : '—'}</td>
                            <td style={{ ...TD_R, fontWeight: 600 }}>{fmtCur(item.totalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartBox>
              )}
            </div>
          )}

          {/* ── Technicians ── */}
          {activeTab === 'technicians' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.technicianKpis.length > 1 && (
                <TechnicianRadarChart items={data.technicianKpis} />
              )}

              <ChartBox title={t('supervisorAnalytics.sections.technicianPerformance')}>
                {data.technicianKpis.length === 0 ? (
                  <div style={{ padding: '14px 16px' }}>
                    <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
                  </div>
                ) : (
                  <div style={{ padding: '0 16px 12px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                      <thead>
                        <tr>
                          <th style={TH}>{t('supervisorAnalytics.columns.technician')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.closedWOs')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.firstPassRate')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.rejectionRate')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.avgActiveDuration')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.avgResponseTime')}</th>
                          <th style={TH_C}>{t('supervisorAnalytics.columns.avgHolds')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.technicianKpis.map((item) => (
                          <TechRow key={item.technicianId} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartBox>

              {data.technicianKpis.some((item) => item.rejectionCount > 0) && (
                <ChartBox title={t('supervisorAnalytics.sections.technicianRejectionBreakdown')}>
                  <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {data.technicianKpis.filter((item) => item.rejectionCount > 0).map((item) => (
                      <div key={item.technicianId}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sb-text-primary)' }}>{item.name}</span>
                          <Mono size={8} color="var(--sb-text-tertiary)">
                            {t('supervisorAnalytics.columns.rejectionCount')}: {item.rejectionCount}
                          </Mono>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {Object.entries(item.rejectionRateByCategory).map(([reason, entry]) => (
                            <span key={reason} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: 'var(--sb-p-crit-bg)',
                              border: '1px solid rgba(181,53,37,0.2)',
                              borderRadius: 2, padding: '2px 7px',
                              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                              fontSize: 8, color: 'var(--sb-p-crit)',
                            }}>
                              <span>{t(`validationRejectionReason.${reason}`, { defaultValue: reason })}</span>
                              <span style={{ fontWeight: 700 }}>×{entry.count}</span>
                              <span style={{ opacity: 0.65 }}>({fmtPct(entry.rate)})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartBox>
              )}
            </div>
          )}

          {/* ── Preventive ── */}
          {activeTab === 'preventive' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.planComplianceRate')}
                  value={data.preventivePlanEfficiency.complianceRate != null ? fmtPct(data.preventivePlanEfficiency.complianceRate) : '—'}
                  sub={`${data.preventivePlanEfficiency.closedPreventiveWOs} / ${data.preventivePlanEfficiency.totalPreventiveWOs} ${t('supervisorAnalytics.kpi.preventiveClosedDesc')}`}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.anomalyRate')}
                  value={data.preventivePlanEfficiency.anomalyRate != null ? fmtPct(data.preventivePlanEfficiency.anomalyRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.anomalyRateDesc')}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.totalPreventiveWOs')}
                  value={fmt(data.preventivePlanEfficiency.totalPreventiveWOs)}
                  sub={t('supervisorAnalytics.kpi.totalPreventiveWOsDesc')}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.postPreventiveCorrectiveRate')}
                  value={data.preventivePlanEfficiency.postPreventiveCorrectiveRate != null ? fmtPct(data.preventivePlanEfficiency.postPreventiveCorrectiveRate) : '—'}
                  sub={t('supervisorAnalytics.kpi.postPreventiveCorrectiveRateDesc', {
                    days: data.preventivePlanEfficiency.postPreventiveCorrectiveWindowDays,
                  })}
                />
              </div>

              <PlanComplianceTable entries={data.preventivePlanEfficiency.compliancePerPlan} />
              <ChecklistItemAnomalyTable entries={data.preventivePlanEfficiency.anomalyPerChecklistItem} />
            </div>
          )}

          {/* ── Requester ── */}
          {activeTab === 'requester' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
              <KpiMetric
                label={t('supervisorAnalytics.kpi.totalReportsSubmitted')}
                value={fmt(data.requesterAnalytics.totalReportsSubmitted)}
              />
              <KpiMetric
                label={t('supervisorAnalytics.kpi.reportConversionRate')}
                value={data.requesterAnalytics.conversionRate != null ? fmtPct(data.requesterAnalytics.conversionRate) : '—'}
                sub={`${data.requesterAnalytics.totalConverted} ${t('supervisorAnalytics.kpi.reportsConverted')}`}
              />
              <KpiMetric
                label={t('supervisorAnalytics.kpi.reportToActionDelay')}
                value={data.requesterAnalytics.reportToActionAvgDays != null ? `${fmtDec(data.requesterAnalytics.reportToActionAvgDays)} j` : '—'}
                sub={t('supervisorAnalytics.kpi.reportToActionDelayDesc')}
              />
              <KpiMetric
                label={t('supervisorAnalytics.kpi.reportAccuracyRate')}
                value={data.requesterAnalytics.reportAccuracyRate != null ? fmtPct(data.requesterAnalytics.reportAccuracyRate) : '—'}
                sub={t('supervisorAnalytics.kpi.reportAccuracyRateDesc')}
              />
              <KpiMetric
                label={t('supervisorAnalytics.kpi.duplicateSubmissionRate')}
                value={data.requesterAnalytics.duplicateSubmissionRate != null ? fmtPct(data.requesterAnalytics.duplicateSubmissionRate) : '—'}
                sub={t('supervisorAnalytics.kpi.duplicateSubmissionRateDesc')}
              />
            </div>
          )}

          {/* ── Operational ── */}
          {activeTab === 'operational' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--sb-border)' }}>
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.reassignmentCount')}
                  value={fmt(data.operationalOverview.reassignmentCount)}
                  sub={t('supervisorAnalytics.kpi.reassignmentCountDesc')}
                />
                <KpiMetric
                  label={t('supervisorAnalytics.kpi.avgHoldPeriodsPerWo')}
                  value={data.operationalOverview.avgHoldPeriodsPerWo != null ? fmtDec(data.operationalOverview.avgHoldPeriodsPerWo) : '—'}
                  sub={t('supervisorAnalytics.kpi.avgHoldPeriodsDesc')}
                />
              </div>

              {data.technicianKpis.length > 0 && (
                <TechnicianDurationChart items={data.technicianKpis} />
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <ChartBox title={t('supervisorAnalytics.sections.sourceDistribution')}>
                  {Object.keys(data.operationalOverview.sourceDistribution).length === 0 ? (
                    <div style={{ padding: '14px 16px' }}>
                      <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
                    </div>
                  ) : (
                    <div style={{ padding: '0 16px 12px' }}>
                      {Object.entries(data.operationalOverview.sourceDistribution)
                        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                        .map(([source, count]) => (
                          <div key={source} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 0', borderBottom: '1px solid var(--sb-border)',
                          }}>
                            <span style={{ fontSize: 12, color: 'var(--sb-text-secondary)' }}>{source}</span>
                            <Mono size={9} color="var(--sb-text-primary)" weight={600}>{String(count ?? 0)}</Mono>
                          </div>
                        ))}
                    </div>
                  )}
                </ChartBox>

                <ChartBox title={t('supervisorAnalytics.sections.rejectionReasons')}>
                  {Object.keys(data.operationalOverview.rejectionReasonDistribution).length === 0 ? (
                    <div style={{ padding: '14px 16px' }}>
                      <Mono size={9} color="var(--sb-text-tertiary)">{t('supervisorAnalytics.states.noData')}</Mono>
                    </div>
                  ) : (
                    <div style={{ padding: '0 16px 12px' }}>
                      {Object.entries(data.operationalOverview.rejectionReasonDistribution)
                        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                        .map(([reason, count]) => (
                          <div key={reason} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 0', borderBottom: '1px solid var(--sb-border)',
                          }}>
                            <span style={{ fontSize: 12, color: 'var(--sb-text-secondary)' }}>{reason}</span>
                            <Mono size={9} color="var(--sb-text-primary)" weight={600}>{String(count ?? 0)}</Mono>
                          </div>
                        ))}
                    </div>
                  )}
                </ChartBox>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
