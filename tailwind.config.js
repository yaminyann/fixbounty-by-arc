/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '9999px',
    },
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#F9F9F7',
        surface: '#FFFFFF',
        line: '#E6E6E1',
        mute: '#65655F',
        signal: { DEFAULT: '#FDE047', deep: '#EAB308', soft: '#FEF9C3' },
        ok: { DEFAULT: '#15803D', soft: '#DCFCE7' },
        warn: { DEFAULT: '#B45309', soft: '#FEF3C7' },
        danger: { DEFAULT: '#B91C1C', soft: '#FEE2E2' },
        info: { DEFAULT: '#1D4ED8', soft: '#DBEAFE' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.875rem', { lineHeight: '1.35rem' }],
        base: ['1rem', { lineHeight: '1.6rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.625rem', { lineHeight: '2rem' }],
        '3xl': ['2rem', { lineHeight: '2.4rem' }],
        '4xl': ['2.75rem', { lineHeight: '3rem' }],
      },
      boxShadow: {
        // The old hard offset shadows now render as quiet elevation, so every existing surface follows the new direction.
        hard: '0 1px 2px rgba(10, 10, 10, 0.06), 0 1px 1px rgba(10, 10, 10, 0.04)',
        'hard-sm': '0 1px 1px rgba(10, 10, 10, 0.05)',
        card: '0 1px 2px rgba(10, 10, 10, 0.04)',
        pop: '0 16px 40px -12px rgba(10, 10, 10, 0.22), 0 2px 8px rgba(10, 10, 10, 0.06)',
      },
      keyframes: {
        'dialog-in': { from: { opacity: '0', transform: 'translateY(6px) scale(0.99)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'dialog-in': 'dialog-in 160ms ease-out',
        'fade-in': 'fade-in 120ms ease-out',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
}
