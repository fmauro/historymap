// Map colors for light and dark mode. The UI follows the same system setting through CSS.
export interface Theme {
  name: 'light' | 'dark';
  ocean: string;
  land: string;
  ink: string;
  inkSoft: string;
  halo: string;
  border: string;
  borderCulture: string;
  coast: string;
  river: string;
  modern: string;
  modernHalo: string;
  selected: string;
  hatch: string;
  /** How strongly polity colors show through the land color (state, low-confidence state, culture, hand-drawn). */
  tints: { state: number; low: number; culture: number; authored: number };
}

export const LIGHT: Theme = {
  name: 'light',
  ocean: '#c3d3d9',
  land: '#efe7d4',
  ink: '#3b2f1e',
  inkSoft: '#6b5536',
  halo: 'rgba(245, 238, 222, 0.85)',
  border: 'rgba(70, 50, 25, 0.55)',
  borderCulture: 'rgba(70, 50, 25, 0.25)',
  coast: 'rgba(90, 120, 135, 0.35)',
  river: '#9fb8c2',
  modern: '#7a2e4d',
  modernHalo: 'rgba(255, 255, 255, 0.8)',
  selected: '#8a2b0e',
  hatch: 'rgba(140, 95, 45, 0.35)',
  tints: { state: 0.62, low: 0.5, culture: 0.34, authored: 0.25 },
};

export const DARK: Theme = {
  name: 'dark',
  ocean: '#18232a',
  land: '#2a2620',
  ink: '#f1e8d8',
  inkSoft: '#c9b796',
  halo: 'rgba(24, 20, 15, 0.85)',
  border: 'rgba(240, 225, 200, 0.35)',
  borderCulture: 'rgba(240, 225, 200, 0.15)',
  coast: 'rgba(140, 170, 185, 0.25)',
  river: '#2f4b57',
  modern: '#e58fb2',
  modernHalo: 'rgba(0, 0, 0, 0.7)',
  selected: '#ffb070',
  hatch: 'rgba(230, 200, 150, 0.28)',
  tints: { state: 0.55, low: 0.46, culture: 0.3, authored: 0.22 },
};

const query = window.matchMedia?.('(prefers-color-scheme: dark)');

export function currentTheme(): Theme {
  return query?.matches ? DARK : LIGHT;
}

export function onThemeChange(fn: (t: Theme) => void) {
  query?.addEventListener('change', () => fn(currentTheme()));
}
