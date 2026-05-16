'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, PackagePlus } from 'lucide-react';
import { inventoryApi, type PartCatalogItem } from '@/lib/inventory.api';
import {
  computeDeficit,
  sortLowStockParts,
  toggleSortDir,
  type LowStockSortField,
  type SortDir,
} from '@/lib/low-stock-utils';
import { Mono } from '@/components/ui/mono';
import { StockIncomingDialog } from '@/components/storekeeper/stock-incoming-dialog';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const C = {
  border:        'var(--sb-border)',
  borderStrong:  'var(--sb-border-strong)',
  surface:       'var(--sb-surface)',
  bg:            'var(--sb-bg)',
  hover:         'var(--sb-hover)',
  textPrimary:   'var(--sb-text-primary)',
  textSecondary: 'var(--sb-text-secondary)',
  textTertiary:  'var(--sb-text-tertiary)',
  crit:          'var(--sb-p-crit)',
  critBg:        'var(--sb-p-crit-bg)',
} as const;

const COLS = '2fr 1fr 1fr 90px 90px 90px 110px';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  const s = { width: 10, height: 10, color: active ? C.textPrimary : C.textTertiary };
  if (!active) return <ArrowUpDown style={s} />;
  return dir === 'asc' ? <ArrowUp style={s} /> : <ArrowDown style={s} />;
}

function ColHead({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field?: LowStockSortField;
  sortField: LowStockSortField;
  sortDir: SortDir;
  onSort?: (f: LowStockSortField) => void;
}) {
  const inner = (
    <>
      <Mono size={9} color={field && field === sortField ? C.textPrimary : C.textSecondary} tracking="0.13em">
        {label.toUpperCase()}
      </Mono>
      {field && onSort && <SortIcon active={field === sortField} dir={sortDir} />}
    </>
  );

  if (field && onSort) {
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          padding: '9px 12px 9px 0',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {inner}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 12px 9px 0' }}>
      {inner}
    </div>
  );
}

export function LowStockView() {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<LowStockSortField>('deficit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [receivingPart, setReceivingPart] = useState<PartCatalogItem | null>(null);
  const [incomingOpen, setIncomingOpen] = useState(false);

  const { data: parts = [], isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'low-stock'],
    queryFn: inventoryApi.getLowStock,
  });

  function handleSort(field: LowStockSortField) {
    if (sortField === field) {
      setSortDir((d) => toggleSortDir(d));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function openReceive(part: PartCatalogItem) {
    setReceivingPart(part);
    setIncomingOpen(true);
  }

  const sorted = sortLowStockParts(parts, sortField, sortDir);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 8 }}>
        <Loader2 style={{ width: 14, height: 14, color: C.textTertiary, animation: 'spin 1s linear infinite' }} />
        <Mono size={10} color={C.textTertiary} tracking="0.12em">CHARGEMENT…</Mono>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 0',
        gap: 8,
        background: C.critBg,
        border: `1px solid ${C.crit}28`,
      }}>
        <Mono size={10} color={C.crit} tracking="0.12em">{t('storekeeperLowStock.states.error').toUpperCase()}</Mono>
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
        <Mono size={10} color={C.textTertiary} tracking="0.12em">{t('storekeeperLowStock.states.empty').toUpperCase()}</Mono>
      </div>
    );
  }

  return (
    <>
      <div style={{ border: `1px solid ${C.border}`, background: C.bg }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: COLS,
            background: C.surface,
            borderBottom: `1px solid ${C.border}`,
            padding: '0 12px 0 16px',
          }}
        >
          <ColHead label={t('storekeeperLowStock.columns.part')} field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
          <ColHead label={t('storekeeperLowStock.columns.reference')} sortField={sortField} sortDir={sortDir} />
          <ColHead label={t('storekeeperLowStock.columns.location')} sortField={sortField} sortDir={sortDir} />
          <ColHead label={t('storekeeperLowStock.columns.currentStock')} field="currentStock" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
          <ColHead label={t('storekeeperLowStock.columns.minimum')} sortField={sortField} sortDir={sortDir} />
          <ColHead label={t('storekeeperLowStock.columns.deficit')} field="deficit" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
          <div />
        </div>

        {sorted.map((part, idx) => {
          const deficit = computeDeficit(part);
          return (
            <div
              key={part.id}
              style={{
                display: 'grid',
                gridTemplateColumns: COLS,
                borderTop: idx === 0 ? 'none' : `1px solid ${C.border}`,
                padding: '0 12px 0 16px',
                alignItems: 'center',
                minHeight: 46,
                background: C.bg,
              }}
            >
              <div style={{ paddingRight: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{part.name}</span>
              </div>

              <div style={{ paddingRight: 12 }}>
                <Mono size={10} color={C.textTertiary} tracking="0.06em">{part.referenceCode}</Mono>
              </div>

              <div style={{ paddingRight: 12 }}>
                {part.warehouseLocation
                  ? <Mono size={10} color={C.textSecondary} tracking="0.06em">{part.warehouseLocation}</Mono>
                  : <Mono size={10} color={C.textTertiary} tracking="0.06em">—</Mono>
                }
              </div>

              <div style={{ paddingRight: 12 }}>
                <span style={{
                  display: 'inline-flex',
                  background: C.critBg,
                  border: `1px solid ${C.crit}28`,
                  borderRadius: 2,
                  padding: '2px 7px',
                }}>
                  <Mono size={10} color={C.crit} tracking="0.08em" weight={700}>{String(part.currentStock)}</Mono>
                </span>
              </div>

              <div style={{ paddingRight: 12 }}>
                <Mono size={10} color={C.textSecondary} tracking="0.06em">{String(part.minimumStockThreshold)}</Mono>
              </div>

              <div style={{ paddingRight: 12 }}>
                <Mono size={11} color={C.crit} tracking="0.04em" weight={700}>−{deficit}</Mono>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0' }}>
                <button
                  type="button"
                  onClick={() => openReceive(part)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: 2,
                    padding: '4px 10px',
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: C.textSecondary,
                    cursor: 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.hover;
                    e.currentTarget.style.borderColor = C.borderStrong;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = C.border;
                  }}
                >
                  <PackagePlus style={{ width: 11, height: 11 }} />
                  {t('storekeeperLowStock.actions.receive')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <StockIncomingDialog
        open={incomingOpen}
        onOpenChange={(open) => {
          setIncomingOpen(open);
          if (!open) setReceivingPart(null);
        }}
        part={receivingPart}
      />
    </>
  );
}
