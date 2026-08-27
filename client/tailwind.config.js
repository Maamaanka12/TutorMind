/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F8F5F0',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#4F46E5',
          600: '#4338CA',
          700: '#3730A3',
          800: '#312E81',
          900: '#1E1B4B',
          950: '#16132E',
        },
        accent: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#EA580C',
          600: '#C2410C',
          700: '#9A3412',
        },
        surface: {
          50: '#F8FAFF',
          100: '#EEF2FF',
          200: '#E0E7FF',
          300: '#C7D2FE',
        },
        muted: {
          DEFAULT: '#EBEEF8',
          foreground: '#475569',
        },
      },
      fontFamily: {
        display: ['"Baloo 2"', 'cursive'],
        body: ['"Comic Neue"', 'cursive'],
        sans: ['"Comic Neue"', 'cursive'],
      },
      borderRadius: {
        'clay': '20px',
        'clay-lg': '28px',
        'clay-xl': '36px',
      },
      boxShadow: {
        'clay': '6px 6px 0px 0px #C7D2FE, inset 0 2px 0 0 rgba(255,255,255,0.6)',
        'clay-sm': '4px 4px 0px 0px #C7D2FE, inset 0 1px 0 0 rgba(255,255,255,0.5)',
        'clay-lg': '8px 8px 0px 0px #C7D2FE, inset 0 2px 0 0 rgba(255,255,255,0.6)',
        'clay-accent': '6px 6px 0px 0px #FDBA74, inset 0 2px 0 0 rgba(255,255,255,0.5)',
        'clay-inset': 'inset 3px 3px 6px rgba(79,70,229,0.12), inset -2px -2px 4px rgba(255,255,255,0.8)',
        'clay-hover': '8px 8px 0px 0px #C7D2FE, inset 0 2px 0 0 rgba(255,255,255,0.7)',
        'clay-accent-hover': '8px 8px 0px 0px #FDBA74, inset 0 2px 0 0 rgba(255,255,255,0.6)',
      },
      animation: {
        'clay-bounce': 'clayBounce 0.4s ease-out',
        'float': 'float 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        clayBounce: {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
