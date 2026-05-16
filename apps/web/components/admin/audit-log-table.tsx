'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { adminApi } from '@/lib/admin.api';
import type { AuditLogEntry } from '@/lib/admin.api';
import { Mono } from '@/components/ui/mono';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const filterSelectStyle: React.CSSProperties = {
  height: 26,
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  padding: '0 4px 0 8px',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.08em',
  color: 'var(--sb-text-secondary)',
  background: 'var(--sb-bg)',
  cursor: 'pointer',
  outline: 'none',
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function renderValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) {
    return <span style={{ color: 'var(--sb-text-tertiary)', fontStyle: 'italic', fontSize: 11 }}>null</span>;
  }
  if (typeof val === 'boolean') {
    return (
      <span style={{ color: val ? 'var(--sb-s-done)' : 'var(--sb-p-crit)', fontSize: 11, fontFamily: MONO }}>
        {String(val)}
      </span>
    );
  }
  if (typeof val === 'object') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {Object.entries(val as Record<string, unknown>).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
            <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.08em" style={{ minWidth: 80, flexShrink: 0 }}>{k}</Mono>
            <span style={{ fontWeight: 500, wordBreak: 'break-all', color: 'var(--sb-text-primary)', fontSize: 11 }}>
              {Array.isArray(v)
                ? (v as unknown[]).join(', ')
                : v === null || v === undefined
                  ? <span style={{ color: 'var(--sb-text-tertiary)', fontStyle: 'italic' }}>null</span>
                  : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--sb-text-primary)' }}>{String(val)}</span>;
}

function AuditChangeDetail({ before, after, labelBefore, labelAfter }: {
  before: unknown; after: unknown; labelBefore: string; labelAfter: string;
}) {
  const hasBefore = before !== null && before !== undefined;
  const hasAfter  = after  !== null && after  !== undefined;
  if (!hasBefore && !hasAfter) return null;
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.13em" style={{ display: 'block', marginBottom: 6 }}>{labelBefore.toUpperCase()}</Mono>
        <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, background: 'var(--sb-surface)', padding: '8px 10px', minHeight: 32 }}>
          {hasBefore ? renderValue(before) : <span style={{ color: 'var(--sb-text-tertiary)', fontStyle: 'italic', fontSize: 11 }}>—</span>}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.13em" style={{ display: 'block', marginBottom: 6 }}>{labelAfter.toUpperCase()}</Mono>
        <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, background: 'var(--sb-surface)', padding: '8px 10px', minHeight: 32 }}>
          {hasAfter ? renderValue(after) : <span style={{ color: 'var(--sb-text-tertiary)', fontStyle: 'italic', fontSize: 11 }}>—</span>}
        </div>
      </div>
    </div>
  );
}

function AuditLogRow({ entry, labelBefore, labelAfter }: { entry: AuditLogEntry; labelBefore: string; labelAfter: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = (entry.valueBefore !== null && entry.valueBefore !== undefined)
    || (entry.valueAfter !== null && entry.valueAfter !== undefined);

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 1fr 180px 120px 160px 44px',
          padding: '0 16px',
          alignItems: 'center',
          minHeight: 44,
          borderBottom: '1px solid var(--sb-border)',
        }}
      >
        <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.08em">{formatDateTime(entry.createdAt)}</Mono>
        <div style={{ paddingRight: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--sb-text-primary)' }}>{entry.actor.name}</div>
          <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)' }}>{entry.actor.email}</div>
        </div>
        <div style={{ paddingRight: 8 }}>
          <span style={{ display: 'inline-flex', background: 'var(--sb-s-active-bg)', border: '1px solid rgba(181,139,16,0.28)', borderRadius: 2, padding: '2px 6px' }}>
            <Mono size={9} color="var(--sb-s-active)" tracking="0.08em">{entry.actionType}</Mono>
          </span>
        </div>
        <Mono size={10} color="var(--sb-text-secondary)" tracking="0.08em">{entry.targetType}</Mono>
        <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.06em">{entry.targetId}</Mono>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {hasDetail && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                background: expanded ? 'var(--sb-hover)' : 'transparent',
                border: '1px solid var(--sb-border)',
                borderRadius: 2,
                cursor: 'pointer',
                color: 'var(--sb-text-tertiary)',
                flexShrink: 0,
              }}
            >
              {expanded
                ? <ChevronDown style={{ width: 12, height: 12 }} />
                : <ChevronRight style={{ width: 12, height: 12 }} />}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ background: 'var(--sb-surface)', borderBottom: '1px solid var(--sb-border)', padding: '12px 16px' }}>
          <AuditChangeDetail
            before={entry.valueBefore}
            after={entry.valueAfter}
            labelBefore={labelBefore}
            labelAfter={labelAfter}
          />
        </div>
      )}
    </>
  );
}

const KNOWN_TARGET_TYPES = ['Asset', 'SystemConfig', 'User', 'Location', 'Category'] as const;

const KNOWN_ACTION_TYPES = [
  'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_REACTIVATED',
  'CONFIG_UPDATED',
  'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DEACTIVATED', 'CATEGORY_ACTIVATED',
  'LOCATION_CREATED', 'LOCATION_UPDATED', 'LOCATION_DELETED',
  'ASSET_CREATED', 'ASSET_UPDATED', 'ASSET_STATUS_CHANGED',
] as const;

export function AuditLogTable() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');
  const [actionType, setActionType] = useState('');
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', page, targetType, actionType],
    queryFn: () => adminApi.getAuditLog({ page, limit, targetType: targetType || undefined, actionType: actionType || undefined }),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const handleTargetTypeChange = (value: string) => { setTargetType(value); setPage(1); };
  const handleActionTypeChange = (value: string) => { setActionType(value); setPage(1); };

  const headers = [
    t('admin.auditLog.columns.datetime'),
    t('admin.auditLog.columns.actor'),
    t('admin.auditLog.columns.action'),
    t('admin.auditLog.columns.targetType'),
    t('admin.auditLog.columns.targetId'),
    '',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div
        style={{
          minHeight: 44,
          borderBottom: '1px solid var(--sb-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          flexWrap: 'wrap',
          background: 'var(--sb-surface)',
          flexShrink: 0,
        }}
      >
        <select
          value={targetType}
          onChange={(e) => handleTargetTypeChange(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('admin.auditLog.filters.allTargetTypes')}</option>
          {KNOWN_TARGET_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={actionType}
          onChange={(e) => handleActionTypeChange(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          style={filterSelectStyle}
        >
          <option value="">{t('admin.auditLog.filters.allActionTypes')}</option>
          {KNOWN_ACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`admin.auditLog.actionTypes.${type}`, { defaultValue: type })}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {data && (
          <Mono size={9} color="var(--sb-text-tertiary)">
            {data.total} ENTRÉE{data.total !== 1 ? 'S' : ''}
          </Mono>
        )}
      </div>

      {/* Column headers */}
      {!isLoading && !!data?.data.length && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr 180px 120px 160px 44px',
            padding: '0 16px',
            height: 28,
            alignItems: 'center',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          {headers.map((col, i) => (
            <Mono key={i} size={8} tracking="0.13em">{col.toUpperCase()}</Mono>
          ))}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : !data || data.data.length === 0 ? (
          <TableEmpty label={t('admin.auditLog.states.empty')} />
        ) : (
          data.data.map((entry) => (
            <AuditLogRow
              key={entry.id}
              entry={entry}
              labelBefore={t('admin.auditLog.detail.before')}
              labelAfter={t('admin.auditLog.detail.after')}
            />
          ))
        )}
      </div>

      {/* Footer: pagination */}
      <div
        style={{
          height: 36,
          padding: '0 16px',
          borderTop: '1px solid var(--sb-border)',
          background: 'var(--sb-surface)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>
    </div>
  );
}
