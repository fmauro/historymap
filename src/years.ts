// All year logic lives here. Years are integers: negative = BCE, positive = CE.
// There is no year 0 (1 BCE is followed by 1 CE), so 0 is never a valid value.

export const MIN_YEAR = -123000;
export const MAX_YEAR = 2024;

/** Replace an invalid year 0 with the nearest real year in the given direction. */
export function fixZero(year: number, direction: 1 | -1 = 1): number {
  return year === 0 ? direction : year;
}

export function clampYear(year: number): number {
  return fixZero(Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(year))));
}

/** Add a number of years, skipping the missing year 0. addYears(-1, 1) === 1. */
export function addYears(year: number, delta: number): number {
  const astro = year < 0 ? year + 1 : year; // astronomical numbering has a year 0
  const next = astro + delta;
  return clampYear(next <= 0 ? next - 1 : next);
}

/** Fix a data range that touches year 0: a range ending at 0 ends in 1 BCE, one starting at 0 starts in 1 CE. */
export function fixRange(from: number, to: number): [number, number] {
  if (from === 0 && to === 0) return [-1, -1];
  return [fixZero(from, 1), fixZero(to, -1)];
}

export function formatYear(year: number): string {
  if (year < 0) {
    const a = -year;
    return `${a >= 10000 ? a.toLocaleString('en-US') : a} BCE`;
  }
  return `${year} CE`;
}

export function formatRange(from: number, to: number): string {
  if (from === to) return formatYear(from);
  if (from < 0 && to < 0) return `${formatYear(from).replace(' BCE', '')}–${formatYear(to)}`;
  return `${formatYear(from)} – ${formatYear(to)}`;
}

/**
 * Parse user input such as "-500", "500 BC", "500 BCE", "AD 1250", "1250 ce", "10,000 bc".
 * Returns null when the input is not a year.
 */
export function parseYear(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[,.\s]/g, '');
  const m = s.match(/^(ad|ce)?(-?\d+)(bce|bc|ce|ad)?$/);
  if (!m) return null;
  const [, prefix, num, suffix] = m;
  let n = parseInt(num, 10);
  if (Number.isNaN(n) || n === 0) return null;
  const isBce = suffix === 'bce' || suffix === 'bc';
  if (isBce && (n < 0 || prefix)) return null;
  if (isBce) n = -n;
  return clampYear(n);
}
