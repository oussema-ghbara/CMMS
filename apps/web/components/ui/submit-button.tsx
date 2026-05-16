'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

interface SubmitButtonProps {
  isPending: boolean;
  isSuccess?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

export function SubmitButton({ isPending, isSuccess = false, disabled, children }: SubmitButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isSuccess) return;
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2500);
    return () => clearTimeout(timer);
  }, [isSuccess]);

  const isDisabled = isPending || showSuccess || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: showSuccess ? 'var(--sb-s-done)' : isPending ? 'var(--sb-border)' : 'var(--sb-text-primary)',
        color: isPending ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
        border: 'none',
        borderRadius: 2,
        padding: '6px 16px',
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
      }}
    >
      {isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
      {showSuccess && <Check style={{ width: 11, height: 11 }} />}
      {isPending ? 'Enregistrement…' : showSuccess ? 'Enregistré' : children}
    </button>
  );
}
