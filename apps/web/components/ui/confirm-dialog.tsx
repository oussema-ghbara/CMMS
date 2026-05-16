'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Mono } from '@/components/ui/mono';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  isPending?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'destructive',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isPending) onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isPending, onOpenChange]);

  if (!open) return null;

  const confirmBg = variant === 'destructive' ? 'var(--sb-p-crit)' : 'var(--sb-text-primary)';

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onOpenChange(false); }}
    >
      <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 360 }}>

        <div style={{ marginBottom: description ? 8 : 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
            {title}
          </div>
        </div>

        {description && (
          <div style={{ fontSize: 13, color: 'var(--sb-text-secondary)', lineHeight: 1.55, marginBottom: 20 }}>
            {description}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            style={{
              background: 'transparent',
              border: '1px solid var(--sb-border-strong)',
              borderRadius: 2, padding: '6px 16px',
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
              color: 'var(--sb-text-secondary)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: isPending ? 'var(--sb-border)' : confirmBg,
              color: isPending ? 'var(--sb-text-tertiary)' : '#fff',
              border: 'none', borderRadius: 2, padding: '6px 16px',
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
            {confirmLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
