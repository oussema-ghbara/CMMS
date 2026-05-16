import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        sb: {
          bg:           'var(--sb-bg)',
          surface:      'var(--sb-surface)',
          hover:        'var(--sb-hover)',
          rail:         'var(--sb-rail)',
          border:       'var(--sb-border)',
          'border-strong': 'var(--sb-border-strong)',
          'text-primary':   'var(--sb-text-primary)',
          'text-secondary': 'var(--sb-text-secondary)',
          'text-tertiary':  'var(--sb-text-tertiary)',
          'text-on-rail':   'var(--sb-text-on-rail)',
          'text-dim-rail':  'var(--sb-text-dim-rail)',
          accent: 'var(--sb-accent)',
          's-active':    'var(--sb-s-active)',
          's-active-bg': 'var(--sb-s-active-bg)',
          's-open':      'var(--sb-s-open)',
          's-open-bg':   'var(--sb-s-open-bg)',
          's-done':      'var(--sb-s-done)',
          's-done-bg':   'var(--sb-s-done-bg)',
          's-wait':      'var(--sb-s-wait)',
          's-wait-bg':   'var(--sb-s-wait-bg)',
          's-cancel':    'var(--sb-s-cancel)',
          's-cancel-bg': 'var(--sb-s-cancel-bg)',
          'p-crit':      'var(--sb-p-crit)',
          'p-crit-bg':   'var(--sb-p-crit-bg)',
          'p-high':      'var(--sb-p-high)',
          'p-high-bg':   'var(--sb-p-high-bg)',
          'p-norm':      'var(--sb-p-norm)',
          'p-norm-bg':   'var(--sb-p-norm-bg)',
          'p-low':       'var(--sb-p-low)',
          'p-low-bg':    'var(--sb-p-low-bg)',
          'role-supervisor':    'var(--sb-role-supervisor)',
          'role-supervisor-bg': 'var(--sb-role-supervisor-bg)',
          'role-storekeeper':    'var(--sb-role-storekeeper)',
          'role-storekeeper-bg': 'var(--sb-role-storekeeper-bg)',
          'role-technician':    'var(--sb-role-technician)',
          'role-technician-bg': 'var(--sb-role-technician-bg)',
          'role-validator':    'var(--sb-role-validator)',
          'role-validator-bg': 'var(--sb-role-validator-bg)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        sb: '2px',
      },
      fontFamily: {
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
