'use client';

import { useTranslation } from 'react-i18next';
import { Mono } from '@/components/ui/mono';

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
};

export function PaginationControls({ page, totalPages, onPrevious, onNext, className }: PaginationControlsProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 4px',
    opacity: disabled ? 0.4 : 1,
    flexShrink: 0,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className={className}>
      <button type="button" onClick={onPrevious} disabled={prevDisabled} aria-label={t('common.previous')} style={btnStyle(prevDisabled)}>‹</button>
      <Mono size={9} color="var(--sb-text-tertiary)">{t('common.pagination', { page, totalPages })}</Mono>
      <button type="button" onClick={onNext} disabled={nextDisabled} aria-label={t('common.next')} style={btnStyle(nextDisabled)}>›</button>
    </div>
  );
}
