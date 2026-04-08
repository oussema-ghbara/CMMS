'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import { AssetCriticality, AssetStatus } from '@gmao/shared';
import { assetsApi, type AssetListItem } from '@/lib/assets.api';
import { categoriesApi } from '@/lib/categories.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AssetFormDialog } from './asset-form-dialog';
import { AssetDetailDialog } from './asset-detail-dialog';

const LIMIT = 20;

const STATUS_OPTIONS = [
  AssetStatus.OPERATIONAL,
  AssetStatus.IN_MAINTENANCE,
  AssetStatus.MAINTENANCE_BLOCKED,
  AssetStatus.OUT_OF_SERVICE,
  AssetStatus.DECOMMISSIONED,
] as const;

const CRITICALITY_OPTIONS = [
  AssetCriticality.CRITICAL,
  AssetCriticality.STANDARD,
  AssetCriticality.NON_CRITICAL,
] as const;

function getStatusBadgeVariant(
  status: AssetStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (status === AssetStatus.OPERATIONAL) return 'success';
  if (status === AssetStatus.IN_MAINTENANCE) return 'warning';
  if (status === AssetStatus.MAINTENANCE_BLOCKED) return 'warning';
  if (status === AssetStatus.OUT_OF_SERVICE) return 'destructive';
  if (status === AssetStatus.DECOMMISSIONED) return 'secondary';
  return 'secondary';
}

function getCriticalityBadgeVariant(
  criticality: AssetCriticality,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (criticality === AssetCriticality.CRITICAL) return 'destructive';
  if (criticality === AssetCriticality.STANDARD) return 'secondary';
  return 'outline';
}

export function AssetsBoard() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [criticalityFilter, setCriticalityFilter] = useState<AssetCriticality | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetListItem | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetListItem | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => categoriesApi.list(),
  });

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(criticalityFilter ? { criticality: criticalityFilter } : {}),
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    }),
    [page, search, statusFilter, criticalityFilter, categoryFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'assets', queryParams],
    queryFn: () => assetsApi.list(queryParams),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const handleApplyFilters = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setCriticalityFilter('');
    setCategoryFilter('');
    setPage(1);
  };

  const openCreateDialog = () => {
    setEditingAsset(null);
    setFormOpen(true);
  };

  const openEditDialog = (asset: AssetListItem) => {
    setEditingAsset(asset);
    setDetailOpen(false);
    setFormOpen(true);
  };

  const openDetailDialog = (asset: AssetListItem) => {
    setSelectedAsset(asset);
    setDetailOpen(true);
  };

  const selectClass =
    'h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('supervisorAssets.filters.searchPlaceholder')}
              className="w-[280px] pl-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyFilters();
                }
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as AssetStatus | '');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('supervisorAssets.filters.allStatuses')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`supervisorAssets.status.${s}`)}
              </option>
            ))}
          </select>

          <select
            value={criticalityFilter}
            onChange={(e) => {
              setCriticalityFilter(e.target.value as AssetCriticality | '');
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('supervisorAssets.filters.allCriticalities')}</option>
            {CRITICALITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {t(`supervisorAssets.criticality.${c}`)}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">{t('supervisorAssets.filters.allCategories')}</option>
            {(categories ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <Button type="button" variant="outline" onClick={handleApplyFilters}>
            {t('supervisorAssets.filters.apply')}
          </Button>

          <Button type="button" variant="ghost" onClick={handleResetFilters}>
            {t('supervisorAssets.filters.reset')}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <span className="text-sm text-muted-foreground">
              {t('supervisorAssets.total', { count: data.total })}
            </span>
          )}
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            {t('supervisorAssets.actions.create')}
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('supervisorAssets.columns.asset')}</TableHead>
              <TableHead>{t('supervisorAssets.columns.category')}</TableHead>
              <TableHead>{t('supervisorAssets.columns.location')}</TableHead>
              <TableHead>{t('supervisorAssets.columns.criticality')}</TableHead>
              <TableHead>{t('supervisorAssets.columns.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-destructive">
                  {t('supervisorAssets.states.error')}
                </TableCell>
              </TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('supervisorAssets.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{asset.name}</p>
                      {asset.serialNumber && (
                        <p className="text-xs text-muted-foreground font-mono">{asset.serialNumber}</p>
                      )}
                      {asset.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{asset.description}</p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="secondary">{asset.category.name}</Badge>
                  </TableCell>

                  <TableCell>
                    <p className="text-sm text-muted-foreground max-w-[220px] truncate">
                      {asset.location.fullPath}
                    </p>
                  </TableCell>

                  <TableCell>
                    <Badge variant={getCriticalityBadgeVariant(asset.criticality as AssetCriticality)}>
                      {t(`supervisorAssets.criticality.${asset.criticality}`)}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(asset.status as AssetStatus)}>
                      {t(`supervisorAssets.status.${asset.status}`)}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('supervisorAssets.actions.view')}
                        onClick={() => openDetailDialog(asset)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('supervisorAssets.actions.edit')}
                        disabled={asset.status === AssetStatus.DECOMMISSIONED}
                        onClick={() => openEditDialog(asset)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
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

      {/* ── Dialogs ── */}
      <AssetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        asset={editingAsset}
        onSuccess={() => {
          setEditingAsset(null);
        }}
      />

      <AssetDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedAsset(null);
        }}
        asset={selectedAsset}
        onEdit={(asset) => {
          openEditDialog(asset);
        }}
      />
    </div>
  );
}
