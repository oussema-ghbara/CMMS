'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin.api';
import type { AuditLogEntry } from '@/lib/admin.api';
import { Button } from '@/components/ui/button';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-muted-foreground italic">null</span>;
  if (typeof val === 'boolean') return <span className={val ? 'text-green-600' : 'text-red-600'}>{String(val)}</span>;
  if (typeof val === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(val as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground min-w-[80px] shrink-0">{k}</span>
            <span className="font-medium break-all">
              {Array.isArray(v)
                ? (v as unknown[]).join(', ')
                : v === null || v === undefined
                  ? <span className="text-muted-foreground italic">null</span>
                  : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-xs font-medium">{String(val)}</span>;
}

function AuditChangeDetail({ before, after, labelBefore, labelAfter }: {
  before: unknown;
  after: unknown;
  labelBefore: string;
  labelAfter: string;
}) {
  const hasBefore = before !== null && before !== undefined;
  const hasAfter = after !== null && after !== undefined;

  if (!hasBefore && !hasAfter) return null;

  return (
    <div className="flex gap-4 text-xs">
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground font-medium uppercase tracking-wide mb-1.5 text-[10px]">{labelBefore}</p>
        <div className="rounded border bg-muted/40 px-3 py-2 min-h-[2rem]">
          {hasBefore ? renderValue(before) : <span className="text-muted-foreground italic">—</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground font-medium uppercase tracking-wide mb-1.5 text-[10px]">{labelAfter}</p>
        <div className="rounded border bg-muted/40 px-3 py-2 min-h-[2rem]">
          {hasAfter ? renderValue(after) : <span className="text-muted-foreground italic">—</span>}
        </div>
      </div>
    </div>
  );
}

function AuditLogRow({ entry, labelBefore, labelAfter }: {
  entry: AuditLogEntry;
  labelBefore: string;
  labelAfter: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.valueBefore !== null && entry.valueBefore !== undefined
    || entry.valueAfter !== null && entry.valueAfter !== undefined;

  return (
    <>
      <TableRow className={cn(expanded && 'border-b-0')}>
        <TableCell className="text-sm whitespace-nowrap">
          {formatDateTime(entry.createdAt)}
        </TableCell>
        <TableCell>
          <p className="text-sm font-medium">{entry.actor.name}</p>
          <p className="text-xs text-muted-foreground">{entry.actor.email}</p>
        </TableCell>
        <TableCell>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {entry.actionType}
          </code>
        </TableCell>
        <TableCell className="text-sm">{entry.targetType}</TableCell>
        <TableCell>
          <code className="text-xs text-muted-foreground">{entry.targetId}</code>
        </TableCell>
        <TableCell className="text-right">
          {hasDetail && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 px-4 py-3">
            <AuditChangeDetail
              before={entry.valueBefore}
              after={entry.valueAfter}
              labelBefore={labelBefore}
              labelAfter={labelAfter}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const KNOWN_TARGET_TYPES = ['Asset', 'SystemConfig', 'User', 'Location', 'Category'] as const;

const KNOWN_ACTION_TYPES = [
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'CONFIG_UPDATED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DEACTIVATED',
  'CATEGORY_ACTIVATED',
  'LOCATION_CREATED',
  'LOCATION_UPDATED',
  'LOCATION_DELETED',
  'ASSET_CREATED',
  'ASSET_UPDATED',
  'ASSET_STATUS_CHANGED',
] as const;

export function AuditLogTable() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');
  const [actionType, setActionType] = useState('');
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', page, targetType, actionType],
    queryFn: () =>
      adminApi.getAuditLog({
        page,
        limit,
        targetType: targetType || undefined,
        actionType: actionType || undefined,
      }),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const handleTargetTypeChange = (value: string) => {
    setTargetType(value);
    setPage(1);
  };

  const handleActionTypeChange = (value: string) => {
    setActionType(value);
    setPage(1);
  };

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={targetType}
          onChange={(e) => handleTargetTypeChange(e.target.value)}
          className={selectClass}
        >
          <option value="">{t('admin.auditLog.filters.allTargetTypes')}</option>
          {KNOWN_TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          value={actionType}
          onChange={(e) => handleActionTypeChange(e.target.value)}
          className={selectClass}
        >
          <option value="">{t('admin.auditLog.filters.allActionTypes')}</option>
          {KNOWN_ACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`admin.auditLog.actionTypes.${type}`, { defaultValue: type })}
            </option>
          ))}
        </select>

        {data && (
          <span className="text-sm text-muted-foreground">
            {t('admin.auditLog.total', { count: data.total })}
          </span>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.auditLog.columns.datetime')}</TableHead>
              <TableHead>{t('admin.auditLog.columns.actor')}</TableHead>
              <TableHead>{t('admin.auditLog.columns.action')}</TableHead>
              <TableHead>{t('admin.auditLog.columns.targetType')}</TableHead>
              <TableHead>{t('admin.auditLog.columns.targetId')}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('admin.auditLog.states.empty')}
                </TableCell>
              </TableRow>
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
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  );
}
