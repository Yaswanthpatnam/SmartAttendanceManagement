/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0FDF8',
          100: '#AAFFC7',
          300: '#78DABE',
          500: '#53B4AF',
          700: '#3F8F99',
          800: '#376A7B',
          900: '#2F4858',
        }
      }
    },
  },
  plugins: [],
}
