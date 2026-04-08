'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin.api';
import { Button } from '@/components/ui/button';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TARGET_TYPES = ['User', 'WorkOrder', 'Asset', 'Part', 'SystemConfig'];

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
          {TARGET_TYPES.map((t) => (
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Aucune entrée dans le journal
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((entry) => (
                <TableRow key={entry.id}>
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
                </TableRow>
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
