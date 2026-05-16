'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import {
  Loader2, PackagePlus, SlidersHorizontal, History, Undo2, FileText,
  Power, PowerOff, Pencil, X,
} from 'lucide-react';
import type { PartCatalogItem } from '@/lib/inventory.api';
import { inventoryApi } from '@/lib/inventory.api';
import { Mono } from '@/components/ui/mono';
import { Button } from '@/components/ui/button';
import { StockIncomingDialog } from '@/components/storekeeper/stock-incoming-dialog';
import { StockAdjustmentDialog } from '@/components/storekeeper/stock-adjustment-dialog';
import { StockMovementsDialog } from '@/components/storekeeper/stock-movements-dialog';
import { StockReturnDialog } from '@/components/storekeeper/stock-return-dialog';
import { PartDocumentsDialog } from '@/components/storekeeper/part-documents-dialog';

interface PartDetailPanelProps {
  part: PartCatalogItem;
  onClose: () => void;
  onEdit: (part: PartCatalogItem) => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

const LABEL = 'text-[10px] font-mono uppercase tracking-widest text-[var(--sb-muted)] mb-0.5';
const VALUE = 'text-[13px] font-mono text-[var(--sb-text)]';
const ROW = 'border-b border-[var(--sb-border)] px-4 py-3 last:border-b-0';
const TAB_BASE = 'px-4 py-2 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors';
const TAB_ACTIVE = 'border-[var(--sb-text)] text-[var(--sb-text)]';
const TAB_INACTIVE = 'border-transparent text-[var(--sb-muted)] hover:text-[var(--sb-text)]';

export function PartDetailPanel({ part, onClose, onEdit }: PartDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'detail' | 'actions'>('detail');
  const [incomingOpen, setIncomingOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: () =>
      part.isActive ? inventoryApi.deactivatePart(part.id) : inventoryApi.activatePart(part.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storekeeper', 'inventory'] });
      toast.success(
        part.isActive
          ? t('storekeeperInventory.toasts.deactivateSuccess')
          : t('storekeeperInventory.toasts.activateSuccess'),
      );
    },
    onError: (error) => {
      toast.error(
        getErrorMessage(
          error,
          part.isActive
            ? t('storekeeperInventory.toasts.deactivateError')
            : t('storekeeperInventory.toasts.activateError'),
        ),
      );
    },
  });

  const isLowStock =
    part.minimumStockThreshold > 0 && part.currentStock < part.minimumStockThreshold;

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderLeft: '1px solid var(--sb-border)', background: 'var(--sb-surface)' }}
    >
      {/* header */}
      <div
        className="flex items-start justify-between gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: '#181613', borderBottom: '1px solid var(--sb-border)' }}
      >
        <div className="min-w-0">
          <Mono className="text-[11px] uppercase tracking-widest text-[#8B8680] mb-1">
            {part.referenceCode}
          </Mono>
          <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">
            {part.name}
          </p>
          <span
            className="mt-1 inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-sm"
            style={
              part.isActive
                ? { background: '#1E3A1E', color: '#6DBE6D' }
                : { background: '#2A1A1A', color: '#B53525' }
            }
          >
            {part.isActive
              ? t('storekeeperInventory.status.active')
              : t('storekeeperInventory.status.inactive')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-[#8B8680] hover:text-white transition-colors mt-0.5"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* tabs */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: '1px solid var(--sb-border)' }}
      >
        <button
          className={`${TAB_BASE} ${activeTab === 'detail' ? TAB_ACTIVE : TAB_INACTIVE}`}
          onClick={() => setActiveTab('detail')}
        >
          DÉTAIL
        </button>
        <button
          className={`${TAB_BASE} ${activeTab === 'actions' ? TAB_ACTIVE : TAB_INACTIVE}`}
          onClick={() => setActiveTab('actions')}
        >
          ACTIONS
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'detail' && (
          <div>
            {/* stock */}
            <div className={ROW}>
              <div className={LABEL}>{t('storekeeperInventory.columns.stock')}</div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[28px] font-mono font-bold leading-none"
                  style={{ color: isLowStock ? '#D97706' : 'var(--sb-text)' }}
                >
                  {part.currentStock}
                </span>
                <span className="text-[11px] font-mono text-[var(--sb-muted)] self-end mb-1">
                  {t(`storekeeperInventory.units.${part.unit}`)}
                </span>
                {isLowStock && (
                  <span
                    className="ml-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-sm"
                    style={{ background: '#3D2A00', color: '#D97706' }}
                  >
                    {t('storekeeperInventory.labels.lowStock')}
                  </span>
                )}
              </div>
            </div>

            <div className={ROW}>
              <div className={LABEL}>{t('storekeeperInventory.columns.minimum')}</div>
              <div className={VALUE}>{part.minimumStockThreshold}</div>
            </div>

            <div className={ROW}>
              <div className={LABEL}>{t('storekeeperInventory.columns.unit')}</div>
              <div className={VALUE}>{t(`storekeeperInventory.units.${part.unit}`)}</div>
            </div>

            <div className={ROW}>
              <div className={LABEL}>{t('storekeeperInventory.form.unitCost')}</div>
              <div className={VALUE}>{Number(part.unitCost).toFixed(2)}</div>
            </div>

            <div className={ROW}>
              <div className={LABEL}>{t('storekeeperInventory.columns.location')}</div>
              <div className={VALUE}>
                {part.warehouseLocation || (
                  <span className="text-[var(--sb-muted)]">
                    {t('storekeeperInventory.labels.noLocation')}
                  </span>
                )}
              </div>
            </div>

            {part.description && (
              <div className={ROW}>
                <div className={LABEL}>{t('storekeeperInventory.form.description')}</div>
                <div className="text-[12px] text-[var(--sb-text)] leading-relaxed">
                  {part.description}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="p-4 space-y-3">
            <div>
              <Mono className="text-[10px] uppercase tracking-widest text-[var(--sb-muted)] mb-2">
                STOCK
              </Mono>
              <div className="space-y-2">
                <button
                  onClick={() => setIncomingOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border border-[var(--sb-border)] hover:bg-[var(--sb-hover)] transition-colors"
                  style={{ color: 'var(--sb-text)' }}
                >
                  <PackagePlus className="h-4 w-4 flex-shrink-0" />
                  {t('storekeeperInventory.actions.receiveStock')}
                </button>
                <button
                  onClick={() => setAdjustmentOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border border-[var(--sb-border)] hover:bg-[var(--sb-hover)] transition-colors"
                  style={{ color: 'var(--sb-text)' }}
                >
                  <SlidersHorizontal className="h-4 w-4 flex-shrink-0" />
                  {t('storekeeperInventory.actions.adjustStock')}
                </button>
                <button
                  onClick={() => setReturnOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border border-[var(--sb-border)] hover:bg-[var(--sb-hover)] transition-colors"
                  style={{ color: 'var(--sb-text)' }}
                >
                  <Undo2 className="h-4 w-4 flex-shrink-0" />
                  {t('storekeeperInventory.actions.returnStock')}
                </button>
                <button
                  onClick={() => setMovementsOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border border-[var(--sb-border)] hover:bg-[var(--sb-hover)] transition-colors"
                  style={{ color: 'var(--sb-text)' }}
                >
                  <History className="h-4 w-4 flex-shrink-0" />
                  {t('storekeeperInventory.actions.viewMovements')}
                </button>
                <button
                  onClick={() => setDocumentsOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border border-[var(--sb-border)] hover:bg-[var(--sb-hover)] transition-colors"
                  style={{ color: 'var(--sb-text)' }}
                >
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  {t('storekeeperInventory.actions.viewDocuments')}
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--sb-border)', paddingTop: '12px' }}>
              <Mono className="text-[10px] uppercase tracking-widest text-[var(--sb-muted)] mb-2">
                GESTION
              </Mono>
              <div className="space-y-2">
                <button
                  onClick={() => onEdit(part)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border border-[var(--sb-border)] hover:bg-[var(--sb-hover)] transition-colors"
                  style={{ color: 'var(--sb-text)' }}
                >
                  <Pencil className="h-4 w-4 flex-shrink-0" />
                  {t('storekeeperInventory.actions.edit')}
                </button>

                <button
                  onClick={() => toggleMutation.mutate()}
                  disabled={toggleMutation.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm border transition-colors disabled:opacity-50"
                  style={
                    part.isActive
                      ? { borderColor: '#B53525', color: '#B53525' }
                      : { borderColor: '#3D6B3A', color: '#6DBE6D' }
                  }
                >
                  {toggleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                  ) : part.isActive ? (
                    <PowerOff className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <Power className="h-4 w-4 flex-shrink-0" />
                  )}
                  {part.isActive
                    ? t('storekeeperInventory.actions.deactivate')
                    : t('storekeeperInventory.actions.activate')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* stock dialogs — self-contained in panel */}
      <StockIncomingDialog
        open={incomingOpen}
        onOpenChange={setIncomingOpen}
        part={part}
      />
      <StockAdjustmentDialog
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        part={part}
      />
      <StockMovementsDialog
        open={movementsOpen}
        onOpenChange={setMovementsOpen}
        part={part}
      />
      <StockReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        part={part}
      />
      <PartDocumentsDialog
        open={documentsOpen}
        onOpenChange={setDocumentsOpen}
        part={part}
      />
    </div>
  );
}
