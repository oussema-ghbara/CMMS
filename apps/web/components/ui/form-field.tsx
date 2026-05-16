'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, required, hint, error, htmlFor, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={htmlFor}
          style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            color: 'var(--sb-text-secondary)',
          }}
        >
          {label}
          {required && (
            <span style={{ marginLeft: '3px', color: 'var(--sb-p-crit)' }}>*</span>
          )}
        </label>
        {hint && (
          <span
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '10px',
              color: 'var(--sb-text-tertiary)',
            }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
      {error && (
        <p style={{ marginTop: '4px', fontSize: '11px', color: 'var(--sb-p-crit)', lineHeight: 1.3 }}>
          {error}
        </p>
      )}
    </div>
  );
}
