'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

function AuditChangeDetail({ before, after }: { before: unknown; after: unknown }) {
  const hasBefore = before !== null && before !== undefined;
  const hasAfter = after !== null && after !== undefined;

  if (!hasBefore && !hasAfter) return null;

  return (
    <div className="flex gap-4 text-xs">
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground font-medium uppercase tracking-wide mb-1.5 text-[10px]">Avant</p>
        <div className="rounded border bg-muted/40 px-3 py-2 min-h-[2rem]">
          {hasBefore ? renderValue(before) : <span className="text-muted-foreground italic">—</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground font-medium uppercase tracking-wide mb-1.5 text-[10px]">Après</p>
        <div className="rounded border bg-muted/40 px-3 py-2 min-h-[2rem]">
          {hasAfter ? renderValue(after) : <span className="text-muted-foreground italic">—</span>}
        </div>
      </div>
    </div>
  );
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
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
              title={expanded ? 'Masquer les détails' : 'Voir les détails'}
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
            <AuditChangeDetail before={entry.valueBefore} after={entry.valueAfter} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// All targetTypes that the backend writes to the audit log.
// Derived from: UsersService, SystemConfigService, AssetsService.
const KNOWN_TARGET_TYPES = ['Asset', 'SystemConfig', 'User'] as const;

export function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', page, targetType],
    queryFn: () =>
      adminApi.getAuditLog({ page, limit, targetType: targetType || undefined }),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="">Toutes les cibles</option>
          {KNOWN_TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} entrée{data.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date / Heure</TableHead>
              <TableHead>Acteur</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Type de cible</TableHead>
              <TableHead>ID cible</TableHead>
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
                  Aucune entrée dans le journal
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((entry) => (
                <AuditLogRow key={entry.id} entry={entry} />
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
