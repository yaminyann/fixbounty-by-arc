/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '2px',
      md: '4px',
      lg: '6px',
      full: '9999px',
    },
    extend: {
      colors: {
        ink: '#000000',
        paper: '#FAFAF8',
        line: '#E2E2DC',
        mute: '#66665F',
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
        '2xl': ['1.75rem', { lineHeight: '2.1rem' }],
        '4xl': ['2.75rem', { lineHeight: '3rem' }],
      },
      boxShadow: {
        hard: '3px 3px 0 0 #000',
        'hard-sm': '2px 2px 0 0 #000',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'dialog-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'dialog-in': 'dialog-in 160ms ease-out',
        'fade-in': 'fade-in 120ms ease-out',
      },
    },
  },
  plugins: [],
}
