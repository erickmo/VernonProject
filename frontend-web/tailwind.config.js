export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cool violet — the company purple as a clean editorial violet. Contrast
        // checked: white-on-600 5.7:1, 600-on-canvas 5.36:1, 300-on-slate 9.67:1.
        brand: {
          50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
          400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9',
          800: '#5b21b6', 900: '#4c1d95',
        },
        canvas:  'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink:     'rgb(var(--ink) / <alpha-value>)',
        muted:   'rgb(var(--muted) / <alpha-value>)',
        line:    'rgb(var(--line) / <alpha-value>)',
        hover:   'rgb(var(--hover) / <alpha-value>)',
        // Named paper palette — shared with mobile (/m). Kept so /m components
        // reused here (via @ -> ../frontend/src) render with the same warm surfaces.
        paper: {
          DEFAULT: '#FAF7F0',
          card: '#FFFDF8',
          edge: '#EAE3D5',
          line: '#F1E9DD',
        },
      },
      fontFamily: {
        // Cool-editorial pair: Instrument Serif (crisp high-contrast serif display)
        // + Familjen Grotesk (neutral grotesque body, shared voice with mobile /m).
        sans: ['"Familjen Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'ui-serif', 'serif'],
      },
      boxShadow: {
        // Warm-tinted shadows to match mobile (shared /m components use shadow-card/nav).
        card: '0 2px 10px -2px rgb(120 80 40 / 0.08), 0 1px 2px 0 rgb(120 80 40 / 0.05)',
        'card-hover': '0 6px 20px -4px rgb(120 80 40 / 0.12), 0 2px 6px -1px rgb(120 80 40 / 0.07)',
        pop: '0 8px 30px -8px rgb(15 23 42 / 0.16), 0 2px 6px -2px rgb(15 23 42 / 0.10)',
        nav: '0 -1px 12px 0 rgb(120 80 40 / 0.07)',
      },
      keyframes: {
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-in-right': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        // Bouncy celebration pop — matches mobile (shared components use animate-pop).
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        wiggle: { '0%, 100%': { transform: 'rotate(-9deg)' }, '50%': { transform: 'rotate(9deg)' } },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(12deg)' },
          '50%': { transform: 'translateY(-5px) rotate(12deg)' },
        },
        rise: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        // Slow light sweep across the navbar bar — restrained, ambient.
        sheen: { '0%': { transform: 'translateX(-160%) skewX(-12deg)' }, '100%': { transform: 'translateX(320%) skewX(-12deg)' } },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        pop: 'pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        wiggle: 'wiggle 1.4s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        rise: 'rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        sheen: 'sheen 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
