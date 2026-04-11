/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        mnemo: {
          app: 'var(--mnemo-bg-app)',
          panel: 'var(--mnemo-bg-panel)',
          'panel-elevated': 'var(--mnemo-bg-panel-elevated)',
          hover: 'var(--mnemo-bg-hover)',
          active: 'var(--mnemo-bg-active)',
          border: 'var(--mnemo-border)',
          'border-strong': 'var(--mnemo-border-strong)',
          text: 'var(--mnemo-text)',
          muted: 'var(--mnemo-text-muted)',
          dim: 'var(--mnemo-text-dim)',
          accent: 'var(--mnemo-accent)',
          'on-accent': 'var(--mnemo-on-accent)',
          'category-bar': 'var(--mnemo-category-bar)',
        },
      },
    },
  },
  plugins: [],
};
