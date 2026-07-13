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
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
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
        // Match mobile: Figtree body + Familjen Grotesk display.
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Familjen Grotesk"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Warm-tinted shadows to match mobile (shared /m components use shadow-card/nav).
        card: '0 2px 10px -2px rgb(120 80 40 / 0.08), 0 1px 2px 0 rgb(120 80 40 / 0.05)',
        'card-hover': '0 6px 20px -4px rgb(120 80 40 / 0.12), 0 2px 6px -1px rgb(120 80 40 / 0.07)',
        pop: '0 4px 24px -6px rgb(15 15 15 / 0.12), 0 1px 3px 0 rgb(15 15 15 / 0.06)',
        nav: '0 -1px 12px 0 rgb(120 80 40 / 0.07)',
      },
      keyframes: {
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
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
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        pop: 'pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        wiggle: 'wiggle 1.4s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        rise: 'rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
