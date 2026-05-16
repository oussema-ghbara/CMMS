'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, MapPin, Settings2 } from 'lucide-react';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { locationsApi, type LocationItem, type LevelNameItem } from '@/lib/locations.api';
import { Mono } from '@/components/ui/mono';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LocationFormDialog } from './location-form-dialog';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const SUPPORTED_LEVELS = [1, 2, 3, 4, 5] as const;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 12,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
  boxSizing: 'border-box',
};

function RowBtn({ onClick, disabled, children, destructive }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: `1px solid ${destructive ? 'rgba(181,53,37,0.35)' : 'var(--sb-border)'}`,
        borderRadius: 2,
        padding: '3px 8px',
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: destructive ? 'var(--sb-p-crit)' : 'var(--sb-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function LevelNamesCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({});

  const { data: levelNames = [], isLoading } = useQuery({
    queryKey: ['admin', 'locations', 'level-names'],
    queryFn: () => locationsApi.getLevelNames(),
  });

  const saveMutation = useMutation({
    mutationFn: (items: LevelNameItem[]) => locationsApi.setLevelNames(items),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'locations', 'level-names'], updated);
      toast.success(t('admin.locations.levelNames.toasts.saveSuccess'));
      setEditing(false);
    },
    onError: () => toast.error(t('admin.locations.levelNames.toasts.saveError')),
  });

  const nameForLevel = (level: number): string =>
    levelNames.find((n) => n.level === level)?.name ?? `Niveau ${level}`;

  const handleEdit = () => {
    const initial: Record<number, string> = {};
    for (const level of SUPPORTED_LEVELS) initial[level] = nameForLevel(level);
    setDraft(initial);
    setEditing(true);
  };

  const handleSave = () => {
    const items: LevelNameItem[] = SUPPORTED_LEVELS.map((level) => ({
      level,
      name: (draft[level] ?? nameForLevel(level)).trim() || nameForLevel(level),
    }));
    saveMutation.mutate(items);
  };

  return (
    <div style={{ border: '1px solid var(--sb-border)', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--sb-surface)',
          borderBottom: '1px solid var(--sb-border)',
          padding: '0 16px',
          height: 36,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Settings2 style={{ width: 12, height: 12, color: 'var(--sb-text-tertiary)' }} />
          <Mono size={9} color="var(--sb-text-secondary)" tracking="0.13em">
            {t('admin.locations.levelNames.title').toUpperCase()}
          </Mono>
        </div>
        {!editing && !isLoading && (
          <button
            type="button"
            onClick={handleEdit}
            style={{
              background: 'transparent',
              border: '1px solid var(--sb-border)',
              borderRadius: 2,
              padding: '3px 8px',
              fontFamily: MONO,
              fontSize: 8,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--sb-text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('common.edit')}
          </button>
        )}
      </div>

      <div style={{ padding: '12px 16px' }}>
        <p style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', margin: '0 0 10px' }}>
          {t('admin.locations.levelNames.subtitle')}
        </p>

        {isLoading ? (
          <Loader2 style={{ width: 14, height: 14, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
        ) : editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SUPPORTED_LEVELS.map((level) => (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.10em" style={{ width: 60, flexShrink: 0 }}>
                  {t('admin.locations.levelNames.levelLabel', { level })}
                </Mono>
                <input
                  value={draft[level] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [level]: e.target.value }))}
                  maxLength={50}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
                  style={inputStyle}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: saveMutation.isPending ? 'var(--sb-border)' : 'var(--sb-text-primary)',
                  color: saveMutation.isPending ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
                  border: 'none',
                  borderRadius: 2,
                  padding: '6px 14px',
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  cursor: saveMutation.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {saveMutation.isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
                {t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saveMutation.isPending}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--sb-border)',
                  borderRadius: 2,
                  padding: '6px 14px',
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: 'var(--sb-text-secondary)',
                  cursor: saveMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: saveMutation.isPending ? 0.5 : 1,
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUPPORTED_LEVELS.map((level) => (
              <span key={level} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--sb-surface)', border: '1px solid var(--sb-border)', borderRadius: 2, padding: '2px 8px' }}>
                <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.08em">{level}:</Mono>
                <Mono size={9} color="var(--sb-text-secondary)" tracking="0.08em">{nameForLevel(level)}</Mono>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const GRID = '1fr 1fr 120px 100px 1fr 90px';

export function LocationsTable() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationItem | null>(null);

  const { data: locations = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'locations'],
    queryFn: () => locationsApi.list(),
  });

  const { data: levelNames = [] } = useQuery({
    queryKey: ['admin', 'locations', 'level-names'],
    queryFn: () => locationsApi.getLevelNames(),
  });

  const levelLabel = (level: number): string =>
    levelNames.find((n) => n.level === level)?.name ?? `Niveau ${level}`;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'locations'] });
      toast.success(t('admin.locations.toasts.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('admin.locations.toasts.deleteError')));
      setDeleteTarget(null);
    },
  });

  const headers = [
    t('admin.locations.columns.name'),
    t('admin.locations.columns.path'),
    t('admin.locations.columns.level'),
    t('admin.locations.columns.code'),
    t('admin.locations.columns.description'),
    t('common.actions'),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LevelNamesCard />

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
          <div style={{ flex: 1 }} />

          {!isLoading && !isError && (
            <Mono size={9} color="var(--sb-text-tertiary)">
              {locations.length} SITE{locations.length !== 1 ? 'S' : ''}
            </Mono>
          )}

          <button
            type="button"
            onClick={() => { setEditingLocation(null); setDialogOpen(true); }}
            style={{
              fontFamily: MONO,
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
            + {t('admin.locations.actions.create')}
          </button>
        </div>

        {/* Column headers */}
        {!isLoading && !isError && locations.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
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
          ) : isError ? (
            <TableError label={t('admin.locations.states.error')} />
          ) : locations.length === 0 ? (
            <TableEmpty label={t('admin.locations.states.empty')} />
          ) : (
            locations.map((location) => (
              <div
                key={location.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  padding: '0 16px',
                  alignItems: 'center',
                  minHeight: 44,
                  borderBottom: '1px solid var(--sb-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingRight: 8 }}>
                  <MapPin style={{ width: 12, height: 12, color: 'var(--sb-text-tertiary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {location.name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {location.fullPath}
                </div>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--sb-surface)', border: '1px solid var(--sb-border)', borderRadius: 2, padding: '2px 7px' }}>
                    <Mono size={9} color="var(--sb-text-secondary)" tracking="0.08em">{levelLabel(location.level)}</Mono>
                  </span>
                </div>
                <div>
                  {location.code
                    ? <Mono size={10} color="var(--sb-text-secondary)" tracking="0.08em">{location.code}</Mono>
                    : <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.08em">—</Mono>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {location.description || '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RowBtn onClick={() => { setEditingLocation(location); setDialogOpen(true); }}>
                    {t('common.edit')}
                  </RowBtn>
                  <RowBtn
                    onClick={() => setDeleteTarget(location)}
                    disabled={deleteMutation.isPending}
                    destructive
                  >
                    {t('common.delete')}
                  </RowBtn>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <LocationFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingLocation(null); }}
        location={editingLocation}
        locations={locations}
        onSuccess={() => { void queryClient.invalidateQueries({ queryKey: ['admin', 'locations'] }); }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('admin.locations.confirmDelete.title')}
        description={deleteTarget ? t('admin.locations.confirmDelete.description', { name: deleteTarget.name }) : undefined}
        confirmLabel={t('common.delete')}
        isPending={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
      />
    </div>
  );
}
