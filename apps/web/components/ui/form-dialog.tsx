'use client';

import { useEffect } from 'react';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  maxWidth?: number;
  isPending?: boolean;
  children: React.ReactNode;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  maxWidth = 560,
  isPending = false,
  children,
}: FormDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isPending, onOpenChange]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 20px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onOpenChange(false);
      }}
    >
      <div
        style={{
          background: 'var(--sb-bg)',
          border: '1px solid var(--sb-border)',
          width: '100%',
          maxWidth,
          margin: 'auto',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--sb-text-primary)',
              letterSpacing: '-0.01em',
              ...(description ? { marginBottom: 3 } : {}),
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--sb-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {description}
            </div>
          )}
        </div>

        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}

export const FORM_DIALOG_MONO = MONO;

export const CANCEL_BTN_STYLE = (isPending: boolean): React.CSSProperties => ({
  background: 'transparent',
  border: '1px solid var(--sb-border-strong)',
  borderRadius: 2,
  padding: '6px 16px',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--sb-text-secondary)',
  cursor: isPending ? 'not-allowed' : 'pointer',
  opacity: isPending ? 0.5 : 1,
});

export const DIALOG_SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 8px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  background: 'var(--sb-bg)',
  color: 'var(--sb-text-primary)',
  fontSize: 13,
  outline: 'none',
};

export const DIALOG_FOOTER_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  paddingTop: 16,
  marginTop: 4,
  borderTop: '1px solid var(--sb-border)',
};
