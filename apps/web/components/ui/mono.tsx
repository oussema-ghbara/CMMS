import { CSSProperties } from 'react';

interface MonoProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  tracking?: string;
  block?: boolean;
  uppercase?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Mono({
  children,
  size = 9,
  color = 'var(--sb-text-tertiary)',
  weight = 500,
  tracking = '0.13em',
  block = false,
  uppercase = true,
  style,
  className,
}: MonoProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: size,
        color,
        letterSpacing: tracking,
        textTransform: uppercase ? 'uppercase' : 'none',
        fontWeight: weight,
        display: block ? 'block' : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
