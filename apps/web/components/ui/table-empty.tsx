'use client';

import { Mono } from '@/components/ui/mono';

interface TableEmptyProps {
  label?: string;
  sublabel?: string;
}

export function TableEmpty({ label = 'AUCUN RÉSULTAT', sublabel }: TableEmptyProps) {
  return (
    <div
      style={{
        margin: 16,
        padding: '32px 0',
        border: '1px dashed var(--sb-border)',
        borderRadius: 2,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Mono size={10} color="var(--sb-text-secondary)" tracking="0.12em">
        {label}
      </Mono>
      {sublabel && (
        <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.10em">
          {sublabel}
        </Mono>
      )}
    </div>
  );
}
