/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mist: '#EAF3FC',
        lilac: '#EDE9FA',
        mint: '#E6F2E9',
        pearl: '#F8F8FC',
        slateblue: '#66758D',
        ink: '#35445B',
      },
      fontFamily: {
        display: ['Cormorant Garamond Variable', 'Noto Serif SC Variable', 'serif'],
        serifzh: ['Noto Serif SC Variable', 'Songti SC', 'serif'],
        sans: ['Manrope Variable', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      boxShadow: {
        pearl: '0 24px 70px -32px rgba(53, 68, 91, 0.28)',
        glass: '0 12px 40px -20px rgba(71, 87, 114, 0.28)',
      },
    },
  },
  plugins: [],
};
