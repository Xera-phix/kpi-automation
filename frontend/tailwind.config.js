/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Helvetica Neue', 'Arial Nova', 'Avenir Next', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'ui-monospace', 'monospace'],
      },
      colors: {
        editorial: {
          base: '#F4F1EA',
          surface: '#F8F5EE',
          ink: '#111111',
          accent: '#D9381E',
        },
      },
      boxShadow: {
        'editorial': '0 1px 0 rgba(17, 17, 17, 0.10)',
      },
      borderRadius: {
        'editorial': '2px',
      },
    },
  },
  plugins: [],
}
