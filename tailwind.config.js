/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: '#07131D',
          2: '#0D1E2B',
          3: '#132736',
          4: '#1A3347',
        },
        teal: {
          DEFAULT: '#1A7FA6',
          light: '#2AAED9',
        },
        gold: {
          DEFAULT: '#C8A43E',
          light: '#DDB84A',
        },
        green: {
          DEFAULT: '#0FA97A',
          dark: '#0A8260',
        },
        red: {
          DEFAULT: '#E05252',
        },
        amber: {
          DEFAULT: '#C8A43E',
        },
        purple: {
          DEFAULT: '#8B6CF6',
        },
        cyan: {
          DEFAULT: '#2DC8D8',
        },
        palumar: {
          white: '#EDF4FB',
          'white-2': '#C8D8E8',
          muted: '#7A9BB8',
          border: 'rgba(90,145,185,0.1)',
          'border-2': 'rgba(90,145,185,0.18)',
        },
      },
      screens: {
        'tv': '1920px',
      },
      backdropBlur: {
        lg: '24px',
      },
    },
  },
  plugins: [],
};
