import type { Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { ColorPlanner } from '../scripts/lib/colors';
import { colorIndex } from '../src/palette';

const box = (w: number, s: number, e: number, n: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});

/** Two ids whose hashed colors collide. */
function collidingIds(): [string, string] {
  const seen = new Map<number, string>();
  for (let i = 0; ; i++) {
    const id = `polity-${i}`;
    const c = colorIndex(id);
    if (seen.has(c)) return [seen.get(c)!, id];
    seen.set(c, id);
  }
}

describe('ColorPlanner', () => {
  it('gives neighbours with the same hashed color different colors', () => {
    const [a, b] = collidingIds();
    const planner = new ColorPlanner();
    planner.add(a, 100, 200, 30, box(0, 0, 10, 10));
    planner.add(b, 100, 200, 30, box(10, 0, 20, 10));
    const { colors, clashBefore, clashAfter } = planner.assign();
    expect(clashBefore).toBe(1);
    expect(clashAfter).toBeLessThan(0.5);
    expect(colors.get(a)).not.toBe(colors.get(b));
  });

  it('keeps the hashed color when nothing clashes', () => {
    const [a, b] = collidingIds();
    const planner = new ColorPlanner();
    planner.add(a, 100, 200, 30, box(0, 0, 10, 10));
    planner.add(b, 300, 400, 30, box(10, 0, 20, 10)); // same place, different time: not neighbours
    const { colors } = planner.assign();
    expect(colors.get(a)).toBe(colorIndex(a));
    expect(colors.get(b)).toBe(colorIndex(b));
  });
});
