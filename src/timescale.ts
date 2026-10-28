// Non-linear mapping between slider position t (0..1) and year.
// Deep prehistory is squeezed; 3500 BCE – 1000 CE gets most of the slider.
import { MAX_YEAR, MIN_YEAR, clampYear } from './years';

interface Stop { t: number; year: number; snap: number }

// `snap` rounds years inside the segment that starts at this stop.
export const STOPS: Stop[] = [
  { t: 0, year: MIN_YEAR, snap: 1000 },
  { t: 0.03, year: -10000, snap: 100 },
  { t: 0.12, year: -3500, snap: 1 },
  { t: 0.85, year: 1000, snap: 1 },
  { t: 1, year: MAX_YEAR, snap: 1 },
];

/** Year → slider position. Uses the astronomical year so the scale is continuous across 1 BCE/1 CE. */
export function yearToT(year: number): number {
  const y = year < 0 ? year + 1 : year;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    const ay = a.year < 0 ? a.year + 1 : a.year;
    const by = b.year < 0 ? b.year + 1 : b.year;
    if (y <= by) return a.t + ((y - ay) / (by - ay)) * (b.t - a.t);
  }
  return 1;
}

/** Slider position → year, rounded to the segment's snap size. */
export function tToYear(t: number): number {
  const tt = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (tt <= b.t) {
      const ay = a.year < 0 ? a.year + 1 : a.year;
      const by = b.year < 0 ? b.year + 1 : b.year;
      let astro = ay + ((tt - a.t) / (b.t - a.t)) * (by - ay);
      astro = Math.round(astro / a.snap) * a.snap;
      return clampYear(astro <= 0 ? astro - 1 : astro);
    }
  }
  return MAX_YEAR;
}
