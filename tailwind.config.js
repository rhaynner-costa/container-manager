/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/client/src/**/*.{js,ts,jsx,tsx}', './src/client/index.html'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: 'rgb(var(--color-canvas) / <alpha-value>)',
          subtle: 'rgb(var(--color-canvas-subtle) / <alpha-value>)',
          inset: 'rgb(var(--color-canvas-inset) / <alpha-value>)'
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          muted: 'rgb(var(--color-border-muted) / <alpha-value>)'
        },
        fg: {
          DEFAULT: 'rgb(var(--color-fg) / <alpha-value>)',
          muted: 'rgb(var(--color-fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-fg-subtle) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          emphasis: 'rgb(var(--color-accent-emphasis) / <alpha-value>)'
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          emphasis: 'rgb(var(--color-success-emphasis) / <alpha-value>)'
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          emphasis: 'rgb(var(--color-danger-emphasis) / <alpha-value>)'
        },
        attention: {
          DEFAULT: 'rgb(var(--color-attention) / <alpha-value>)',
          emphasis: 'rgb(var(--color-attention-emphasis) / <alpha-value>)'
        },
        severe: {
          DEFAULT: 'rgb(var(--color-severe) / <alpha-value>)'
        },
        // Cor do logo: índigo no tema claro, lavanda no escuro
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)'
        }
      }
    }
  },
  plugins: []
}
