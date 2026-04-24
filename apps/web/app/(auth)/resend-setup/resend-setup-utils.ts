import { z } from 'zod';

export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw)) {
    const first = raw.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (first) return first;
  }
  return fallback;
}

export function buildResendSetupSchema(requiredMessage: string, invalidEmailMessage: string) {
  return z.object({
    email: z.string().min(1, requiredMessage).email(invalidEmailMessage),
  });
}