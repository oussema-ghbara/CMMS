import { Mono } from './mono';

interface ChartBoxProps {
  title: string;
  children: React.ReactNode;
  cols?: number;
}

export function ChartBox({ title, children, cols = 1 }: ChartBoxProps) {
  return (
    <div
      style={{
        border: '1px solid var(--sb-border)',
        background: 'var(--sb-bg)',
        gridColumn: cols > 1 ? `span ${cols}` : undefined,
      }}
    >
      <div
        style={{
          height: 34,
          background: 'var(--sb-surface)',
          borderBottom: '1px solid var(--sb-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
        }}
      >
        <Mono size={9} color="var(--sb-text-secondary)" tracking="0.12em">
          {title}
        </Mono>
      </div>
      <div style={{ padding: '12px 8px 12px 0' }}>{children}</div>
    </div>
  );
}
