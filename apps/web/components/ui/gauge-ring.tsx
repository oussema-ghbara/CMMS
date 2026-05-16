interface GaugeRingProps {
  value: number;
  max?: number;
  color: string;
  size?: number;
  unit?: string;
}

export function GaugeRing({ value, max = 100, color, size = 88, unit = '' }: GaugeRingProps) {
  const r      = size / 2 - 8;
  const circ   = 2 * Math.PI * r;
  const filled = Math.min(value / max, 1) * circ;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sb-border)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="butt"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 15,
            fontWeight: 800,
            color,
            lineHeight: 1,
          }}
        >
          {Math.round(value)}{unit}
        </span>
      </div>
    </div>
  );
}
