'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

  return (
    <div className={cn('flex w-full items-center justify-between gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page <= 1}
        onClick={onPrevious}
        aria-label={t('common.previous')}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground">{t('common.pagination', { page, totalPages })}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages}
        onClick={onNext}
        aria-label={t('common.next')}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
