import type { AxiosError } from 'axios';

export function formatDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function getChangePasswordErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const raw = axiosError?.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] ?? '';
  if (typeof raw === 'string') return raw;
  return '';
}
