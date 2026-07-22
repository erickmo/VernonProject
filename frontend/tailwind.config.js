/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Indigo brand on the warm paper canvas — cool accent, warm ground.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Paper surfaces — warm cream canvas + card + edge.
        paper: {
          DEFAULT: '#FAF7F0',
          card: '#FFFDF8',
          edge: '#EAE3D5',
          line: '#F1E9DD',
        },
      },
      fontFamily: {
        // Figtree = friendly, slightly narrow humanist body — crisp, not wide.
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Familjen Grotesk = narrow grotesque with character for headings.
        display: ['"Familjen Grotesk"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 10px -2px rgb(120 80 40 / 0.08), 0 1px 2px 0 rgb(120 80 40 / 0.05)',
        nav: '0 -1px 12px 0 rgb(120 80 40 / 0.07)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-in-right': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        // Micro-celebration pop for the progress number at 100%.
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Playful emoji wiggle + gentle sticker float.
        wiggle: {
          '0%, 100%': { transform: 'rotate(-9deg)' },
          '50%': { transform: 'rotate(9deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(12deg)' },
          '50%': { transform: 'translateY(-5px) rotate(12deg)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        pop: 'pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        wiggle: 'wiggle 1.4s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
