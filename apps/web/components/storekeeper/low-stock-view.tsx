'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, PackagePlus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { inventoryApi, type PartCatalogItem } from '@/lib/inventory.api';
import {
  computeDeficit,
  sortLowStockParts,
  toggleSortDir,
  type LowStockSortField,
  type SortDir,
} from '@/lib/low-stock-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StockIncomingDialog } from '@/components/storekeeper/stock-incoming-dialog';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return dir === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
    : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
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
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {t('storekeeperLowStock.states.error')}
      </p>
    );
  }

  if (parts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t('storekeeperLowStock.states.empty')}
      </p>
    );
  }
   
  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center text-xs font-medium"
                  onClick={() => handleSort('name')}
                >
                  {t('storekeeperLowStock.columns.part')}
                  <SortIcon active={sortField === 'name'} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="text-xs font-medium">
                {t('storekeeperLowStock.columns.reference')}
              </TableHead>
              <TableHead className="text-xs font-medium">
                {t('storekeeperLowStock.columns.location')}
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center text-xs font-medium"
                  onClick={() => handleSort('currentStock')}
                >
                  {t('storekeeperLowStock.columns.currentStock')}
                  <SortIcon active={sortField === 'currentStock'} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="text-xs font-medium">
                {t('storekeeperLowStock.columns.minimum')}
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center text-xs font-medium"
                  onClick={() => handleSort('deficit')}
                >
                  {t('storekeeperLowStock.columns.deficit')}
                  <SortIcon active={sortField === 'deficit'} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((part) => (
              <TableRow key={part.id}>
                <TableCell className="font-medium">{part.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {part.referenceCode}
                </TableCell>
                <TableCell className="text-sm">
                  {part.warehouseLocation ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="destructive">{part.currentStock}</Badge>
                </TableCell>
                <TableCell className="text-sm">{part.minimumStockThreshold}</TableCell>
                <TableCell>
                  <span className="font-semibold text-destructive">−{computeDeficit(part)}</span>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => openReceive(part)}
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    {t('storekeeperLowStock.actions.receive')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
