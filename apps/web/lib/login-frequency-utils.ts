import type { LoginFrequencyCategory } from './admin.api';

export type FrequencyBadgeVariant = 'success' | 'default' | 'secondary' | 'warning' | 'destructive';

export const FREQUENCY_BADGE_VARIANT: Record<LoginFrequencyCategory, FrequencyBadgeVariant> = {
  RECENT: 'success',
  WEEKLY: 'default',
  OCCASIONAL: 'secondary',
  INACTIVE: 'warning',
  NEVER: 'destructive',
};

export function formatLoginDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
