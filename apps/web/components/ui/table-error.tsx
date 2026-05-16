'use client';

import { Mono } from '@/components/ui/mono';

interface TableErrorProps {
  label?: string;
  sublabel?: string;
}

export function TableError({ label = 'ERREUR DE CHARGEMENT', sublabel }: TableErrorProps) {
  return (
    <div
      style={{
        margin: 16,
        padding: '12px 14px',
        border: '1px solid var(--sb-p-crit)',
        borderRadius: 2,
        background: 'rgba(181,53,37,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <Mono size={10} color="var(--sb-p-crit)" tracking="0.12em" weight={600}>
        {label}
      </Mono>
      {sublabel && (
        <Mono size={9} color="var(--sb-p-crit)" tracking="0.10em" style={{ opacity: 0.7 }}>
          {sublabel}
        </Mono>
      )}
    </div>
  );
}
