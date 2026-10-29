import type { Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { isLifeway, looksLikeCulture } from '../scripts/lib/classify';
import { Coverage } from '../scripts/lib/coverage';
import { Grid } from '../scripts/lib/raster';

const box = (w: number, s: number, e: number, n: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});

describe('Grid.rasterize', () => {
  it('fills the cells whose centers are inside', () => {
    const g = new Grid(1);
    const cells: number[] = [];
    g.rasterize(box(0, 0, 3, 2), (c) => cells.push(c));
    expect(cells.length).toBe(6);
  });
  it('respects holes', () => {
    const g = new Grid(1);
    const donut: Polygon = { type: 'Polygon', coordinates: [box(0, 0, 3, 3).coordinates[0], box(1, 1, 2, 2).coordinates[0]] };
    let n = 0;
    g.rasterize(donut, () => n++);
    expect(n).toBe(8);
  });
});

describe('Coverage', () => {
  const higher = () => {
    const c = new Coverage();
    c.add({ from: -100, to: 100, geometry: box(0, 0, 10, 10) });
    return c;
  };

  it('keeps shapes when nothing covers them, labelled for their whole life', () => {
    const [a] = new Coverage().analyze([{ from: -50, to: 50, geometry: box(0, 0, 10, 10) }]);
    expect(a.hidden).toBe(false);
    expect(a.labels).toHaveLength(1);
    expect(a.labels[0]).toMatchObject({ from: -50, to: 50 });
  });

  it('drops a shape that is fully hidden for its whole life', () => {
    const [a] = higher().analyze([{ from: -50, to: 50, geometry: box(1, 1, 9, 9) }]);
    expect(a.hidden).toBe(true);
  });

  it('labels the visible part of a half-covered shape', () => {
    const [a] = higher().analyze([{ from: -50, to: 50, geometry: box(0, 0, 20, 10) }]);
    expect(a.hidden).toBe(false);
    for (const l of a.labels) expect(l.point[0]).toBeGreaterThan(10);
  });

  it('shows a shape before the higher one arrives, and hides its label after', () => {
    const [a] = higher().analyze([{ from: -300, to: 50, geometry: box(1, 1, 9, 9) }]);
    expect(a.hidden).toBe(false);
    expect(a.labels).toHaveLength(1);
    expect(a.labels[0].from).toBe(-300);
    expect(a.labels[0].to).toBeLessThan(-100);
  });
});

describe('classify', () => {
  it('tells peoples from states', () => {
    expect(looksLikeCulture('Amazon hunter-gatherers')).toBe(true);
    expect(looksLikeCulture('Celts')).toBe(true);
    expect(looksLikeCulture('Hallstatt culture')).toBe(true);
    expect(looksLikeCulture('Roman Empire')).toBe(false);
    expect(looksLikeCulture('Kingdom of Kush')).toBe(false);
    expect(looksLikeCulture('Maya states')).toBe(false);
    expect(looksLikeCulture('Assyria')).toBe(false);
  });
  it('recognises ways of life', () => {
    expect(isLifeway('Saharan pastoral nomads')).toBe(true);
    expect(isLifeway('Andronovo')).toBe(false);
    expect(isLifeway('La Tène culture')).toBe(false);
  });
});
