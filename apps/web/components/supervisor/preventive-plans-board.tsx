'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, List, Search } from 'lucide-react';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { useTranslation } from 'react-i18next';
import { assetsApi } from '@/lib/assets.api';
import { preventivePlansApi, type PreventivePlanItem, type CalendarPreviewItem } from '@/lib/preventive-plans.api';
import { MasterDetail } from '@/components/ui/master-detail';
import { Mono } from '@/components/ui/mono';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { PreventivePlanDetailPanel } from './preventive-plan-detail-panel';
import { PreventivePlanFormDialog } from './preventive-plan-form-dialog';

const LIMIT = 20;

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

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function PreventivePlansBoard() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [assetFilterId, setAssetFilterId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');
  const [assetSearch, setAssetSearch] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [selected, setSelected] = useState<PreventivePlanItem | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PreventivePlanItem | null>(null);

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(assetFilterId ? { assetId: assetFilterId } : {}),
      ...(statusFilter === 'active' ? { isActive: true } : {}),
      ...(statusFilter === 'inactive' ? { isActive: false } : {}),
    }),
    [assetFilterId, page, statusFilter],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'preventive-plans', queryParams],
    queryFn: () => preventivePlansApi.list(queryParams),
  });

  const assetPickerQuery = useQuery({
    queryKey: ['supervisor', 'preventive-plans', 'asset-picker', assetSearch],
    queryFn: () => assetsApi.list({ page: 1, limit: 20, ...(assetSearch.trim() ? { search: assetSearch.trim() } : {}) }),
  });

  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['supervisor', 'preventive-plans', 'calendar'],
    queryFn: () => preventivePlansApi.getCalendar(),
    enabled: activeView === 'calendar',
  });

  const calendarByDate = useMemo(() => {
    if (!calendarData) return new Map<string, CalendarPreviewItem[]>();
    const map = new Map<string, CalendarPreviewItem[]>();
    for (const item of calendarData) {
      const day = item.generationDate.slice(0, 10);
      const existing = map.get(day) ?? [];
      existing.push(item);
      map.set(day, existing);
    }
    return map;
  }, [calendarData]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const panelOpen = selected !== null;

  const hasActiveFilters = !!(assetSearch || assetFilterId || statusFilter);

  const handleResetFilters = () => {
    setAssetSearch('');
    setAssetFilterId('');
    setStatusFilter('');
    setPage(1);
  };

  const openCreateDialog = () => { setEditingPlan(null); setPlanDialogOpen(true); };
  const openEditDialog = (plan: PreventivePlanItem) => { setEditingPlan(plan); setPlanDialogOpen(true); };

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      { }
      {!isLoading && !isError && !!data?.data.length && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: panelOpen ? 'minmax(0, 1fr) 60px' : 'minmax(0, 1fr) 120px 140px 130px 60px',
          padding: '0 16px', height: 28, alignItems: 'center',
          borderBottom: '1px solid var(--sb-border)', background: 'var(--sb-surface)', flexShrink: 0,
        }}>
          <Mono size={8} tracking="0.13em">{t('supervisorPreventivePlans.columns.title')}</Mono>
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('supervisorPreventivePlans.columns.asset')}</Mono>}
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('supervisorPreventivePlans.columns.frequency')}</Mono>}
          {!panelOpen && <Mono size={8} tracking="0.13em">{t('supervisorPreventivePlans.columns.nextDueAt')}</Mono>}
          <Mono size={8} tracking="0.13em">{t('supervisorPreventivePlans.columns.status')}</Mono>
        </div>
      )}

      { }
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <TableLoading label={t('common.loading')} />
        ) : isError ? (
          <TableError label={t('supervisorPreventivePlans.states.error')} />
        ) : !data?.data.length ? (
          <TableEmpty label={t('supervisorPreventivePlans.states.empty')} />
        ) : (
          data.data.map((plan) => {
            const isSelected = selected?.id === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelected(isSelected ? null : plan)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: panelOpen ? 'minmax(0, 1fr) 60px' : 'minmax(0, 1fr) 120px 140px 130px 60px',
                  padding: '0 16px', height: 48, alignItems: 'center',
                  borderBottom: '1px solid var(--sb-border)',
                  background: isSelected ? 'var(--sb-s-active-bg)' : 'transparent',
                  outline: isSelected ? '1px solid var(--sb-border-strong)' : 'none',
                  outlineOffset: -1,
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--sb-hover)'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                { }
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plan.title}
                  </div>
                  {plan.description && !panelOpen && (
                    <Mono size={9} color="var(--sb-text-tertiary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plan.description}
                    </Mono>
                  )}
                </div>

                { }
                {!panelOpen && (
                  <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plan.asset.name}
                  </div>
                )}

                { }
                {!panelOpen && (
                  <span style={{
                    display: 'inline-flex', padding: '1px 6px', border: '1px solid var(--sb-border)', borderRadius: 2,
                    fontSize: 9, fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                    fontWeight: 600, color: 'var(--sb-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    {t(`supervisorPreventivePlans.frequencyType.${plan.frequencyType}`)}
                  </span>
                )}

                {!panelOpen && (
                  <Mono size={10} color="var(--sb-text-secondary)">{formatDateTime(plan.nextDueAt)}</Mono>
                )}

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: plan.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)' }} />
                  {!panelOpen && (
                    <Mono size={9} color="var(--sb-text-secondary)">
                      {plan.isActive ? t('common.active') : t('common.inactive')}
                    </Mono>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{
        height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        borderTop: '1px solid var(--sb-border)', background: 'var(--sb-surface)', flexShrink: 0,
      }}>
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>
    </div>
  );

  return (
    <>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{
          minHeight: 44,
          borderBottom: '1px solid var(--sb-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          flexWrap: 'wrap',
          background: 'var(--sb-surface)',
          flexShrink: 0,
        }}>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--sb-text-tertiary)',
                pointerEvents: 'none',
              }}
            />
            <input
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder={t('supervisorPreventivePlans.filters.assetSearchPlaceholder')}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              style={{
                height: 26,
                paddingLeft: 26,
                paddingRight: 8,
                width: 200,
                border: '1px solid var(--sb-border)',
                borderRadius: 2,
                fontFamily: 'inherit',
                fontSize: 12,
                color: 'var(--sb-text-primary)',
                background: 'var(--sb-bg)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--sb-border)', flexShrink: 0 }} />

          <select
            value={assetFilterId}
            onChange={(e) => { setAssetFilterId(e.target.value); setPage(1); }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            style={filterSelectStyle}
          >
            <option value="">{t('supervisorPreventivePlans.filters.allAssets')}</option>
            {(assetPickerQuery.data?.data ?? []).map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name} · {asset.location.fullPath}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            style={filterSelectStyle}
          >
            <option value="">{t('supervisorPreventivePlans.filters.allStatuses')}</option>
            <option value="active">{t('supervisorPreventivePlans.filters.active')}</option>
            <option value="inactive">{t('supervisorPreventivePlans.filters.inactive')}</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
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
                flexShrink: 0,
              }}
            >
              {t('supervisorPreventivePlans.filters.reset')}
            </button>
          )}

          <div style={{ flex: 1 }} />

          {data && activeView === 'list' && (
            <Mono size={9} color="var(--sb-text-tertiary)">
              {t('supervisorPreventivePlans.total', { count: data.total })}
            </Mono>
          )}

          <div style={{ display: 'flex', border: '1px solid var(--sb-border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setActiveView('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                border: 'none', cursor: 'pointer',
                background: activeView === 'list' ? 'var(--sb-text-primary)' : 'transparent',
              }}
            >
              <List size={12} style={{ color: activeView === 'list' ? 'var(--sb-bg)' : 'var(--sb-text-secondary)', flexShrink: 0 }} />
              <Mono size={9} color={activeView === 'list' ? 'var(--sb-bg)' : 'var(--sb-text-secondary)'}>
                {t('supervisorPreventivePlans.views.list')}
              </Mono>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('calendar')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                border: 'none', borderLeft: '1px solid var(--sb-border)', cursor: 'pointer',
                background: activeView === 'calendar' ? 'var(--sb-text-primary)' : 'transparent',
              }}
            >
              <CalendarDays size={12} style={{ color: activeView === 'calendar' ? 'var(--sb-bg)' : 'var(--sb-text-secondary)', flexShrink: 0 }} />
              <Mono size={9} color={activeView === 'calendar' ? 'var(--sb-bg)' : 'var(--sb-text-secondary)'}>
                {t('supervisorPreventivePlans.views.calendar')}
              </Mono>
            </button>
          </div>

          <button
            type="button"
            onClick={openCreateDialog}
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: 9,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: 'var(--sb-bg)',
              background: 'var(--sb-text-primary)',
              border: 'none',
              borderRadius: 2,
              padding: '6px 14px',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            + {t('supervisorPreventivePlans.actions.create')}
          </button>
        </div>

        {activeView === 'list' && (
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <MasterDetail
              list={listContent}
              panel={
                selected ? (
                  <PreventivePlanDetailPanel
                    key={selected.id}
                    plan={selected}
                    onClose={() => setSelected(null)}
                    onEdit={(plan) => openEditDialog(plan)}
                  />
                ) : null
              }
              panelOpen={panelOpen}
            />
          </div>
        )}

        {activeView === 'calendar' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {calendarLoading ? (
              <TableLoading label={t('common.loading')} />
            ) : !calendarData || calendarData.length === 0 ? (
              <TableEmpty label={t('supervisorPreventivePlans.calendar.empty')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Mono size={9} color="var(--sb-text-tertiary)">
                  {t('supervisorPreventivePlans.calendar.total', { count: calendarData.length })}
                </Mono>
                {[...calendarByDate.entries()].map(([day, items]) => (
                  <div key={day} style={{ border: '1px solid var(--sb-border)', overflow: 'hidden' }}>
                    <div style={{
                      background: 'var(--sb-surface)', borderBottom: '1px solid var(--sb-border)',
                      padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <CalendarDays size={13} style={{ color: 'var(--sb-text-secondary)', flexShrink: 0 }} />
                      <Mono size={10} weight={600}>
                        {new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(day))}
                      </Mono>
                      <Mono size={9} color="var(--sb-text-secondary)" style={{ marginLeft: 'auto' }}>
                        {t('supervisorPreventivePlans.calendar.itemCount', { count: items.length })}
                      </Mono>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {items.map((item: CalendarPreviewItem, index: number) => (
                        <li key={`${item.planId}-${index}`} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px',
                          borderBottom: index < items.length - 1 ? '1px solid var(--sb-border)' : 'none',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.planTitle}
                            </div>
                            <Mono size={9} color="var(--sb-text-secondary)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.assetName}
                            </Mono>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            {item.estimatedDurationMinutes && (
                              <Mono size={9} color="var(--sb-text-secondary)">{item.estimatedDurationMinutes}min</Mono>
                            )}
                            <Mono size={9} color={item.defaultTechnicianName ? 'var(--sb-text-secondary)' : 'var(--sb-text-tertiary)'}>
                              {item.defaultTechnicianName ?? t('supervisorPreventivePlans.labels.unassigned')}
                            </Mono>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <PreventivePlanFormDialog
        open={planDialogOpen}
        onOpenChange={(open) => { setPlanDialogOpen(open); if (!open) setEditingPlan(null); }}
        plan={editingPlan}
        onSuccess={() => { setPlanDialogOpen(false); setEditingPlan(null); }}
      />
    </>
  );
}
