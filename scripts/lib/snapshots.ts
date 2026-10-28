import { MAX_YEAR, addYears } from '../../src/years';

/**
 * Turn snapshot years into year ranges: snapshot i is valid from its year until the year
 * before snapshot i+1. The last snapshot runs to `end`.
 */
export function snapshotsToIntervals(years: number[], end = MAX_YEAR): Array<[number, number]> {
  const sorted = [...years].sort((a, b) => a - b);
  return sorted.map((y, i) => [y, i + 1 < sorted.length ? addYears(sorted[i + 1], -1) : end]);
}

/** Cut a year range to a window. Returns null when they don't overlap. */
export function clipRange(
  [from, to]: [number, number],
  [wFrom, wTo]: [number, number],
): [number, number] | null {
  const a = Math.max(from, wFrom);
  const b = Math.min(to, wTo);
  return a <= b ? [a, b] : null;
}

/**
 * Merge time slices that have the same key (polity + identical geometry) and touch or overlap in time.
 * Returns items with widened ranges; order is not preserved.
 */
export function mergeSlices<T extends { from: number; to: number }>(items: T[], key: (t: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const g = groups.get(k);
    if (g) g.push(it);
    else groups.set(k, [it]);
  }
  const out: T[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.from - b.from);
    let cur = { ...g[0] };
    for (const it of g.slice(1)) {
      if (it.from <= addYears(cur.to, 1)) cur.to = Math.max(cur.to, it.to);
      else {
        out.push(cur);
        cur = { ...it };
      }
    }
    out.push(cur);
  }
  return out;
}
