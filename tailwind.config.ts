import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/pages/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        elevated: 'var(--bg-elevated)',
        card: 'var(--bg-card)',
        cyan: 'var(--accent-cyan)',
        magenta: 'var(--accent-magenta)',
        amber: 'var(--accent-amber)',
        'electric-blue': 'var(--accent-electric-blue)',
        lime: 'var(--accent-lime)',
        'status-open': 'var(--status-open)',
        'status-progress': 'var(--status-progress)',
        'status-resolved': 'var(--status-resolved)',
        'status-escalated': 'var(--status-escalated)',
        'tier-citizen': 'var(--tier-citizen)',
        'tier-contributor': 'var(--tier-contributor)',
        'tier-guardian': 'var(--tier-guardian)',
        'tier-ambassador': 'var(--tier-ambassador)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        '3xl': 'var(--radius-3xl)',
        '4xl': 'var(--radius-4xl)',
      },
    },
  },
  plugins: [],
};

export default config;
