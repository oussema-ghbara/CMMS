'use client';

import { Mono } from '@/components/ui/mono';

interface TableLoadingProps {
  height?: number;
  label?: string;
}

export function TableLoading({ height = 120, label = 'CHARGEMENT…' }: TableLoadingProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        gap: 8,
      }}
    >
      <div
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          border: '2px solid var(--sb-border-strong)',
          borderTopColor: 'var(--sb-text-primary)',
          animation: 'spin 0.7s linear infinite',
          flexShrink: 0,
        }}
      />
      <Mono size={10} color="var(--sb-text-secondary)" tracking="0.12em">
        {label}
      </Mono>
    </div>
  );
}
