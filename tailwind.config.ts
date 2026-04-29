import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Earthy-green field palette
        pasture: {
          50: '#f1f9f3',
          100: '#ddf0e0',
          200: '#bbe0c2',
          300: '#8ec99a',
          400: '#60ad6f',
          500: '#408f51',
          600: '#2f743f',
          700: '#275c34',
          800: '#21492c',
          900: '#1c3d26'
        }
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
} satisfies Config;
