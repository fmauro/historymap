import { describe, expect, it } from 'vitest';
import { areaSeries, placeHistory, shapesByPid, type PlaceShape } from '../src/history';

const shape = (pid: string, from: number, to: number, prio = 30, extra: Partial<PlaceShape> = {}): PlaceShape => ({
  pid, name: pid, from, to, prio, kind: 'polity', c: 0, ...extra,
});

describe('placeHistory', () => {
  it('lists holders in order and joins touching periods', () => {
    const out = placeHistory([shape('rome', -27, 100), shape('rome', 101, 395), shape('byzantium', 396, 1453)]);
    expect(out.map((s) => [s.pid, s.from, s.to])).toEqual([
      ['rome', -27, 395],
      ['byzantium', 396, 1453],
    ]);
  });

  it('prefers higher-priority sources, then the smaller shape', () => {
    const out = placeHistory([
      shape('celts', -500, -1, 20, { kind: 'culture' }),
      shape('rome', -50, 400, 30, { area: 5e6 }),
      shape('province', 100, 200, 30, { area: 1e5 }),
    ]);
    expect(out.map((s) => [s.pid, s.from, s.to])).toEqual([
      ['celts', -500, -51],
      ['rome', -50, 99],
      ['province', 100, 200],
      ['rome', 201, 400],
    ]);
  });

  it('handles the missing year 0', () => {
    const out = placeHistory([shape('a', -10, -1), shape('b', 1, 10)]);
    expect(out).toHaveLength(2);
    expect(out[1].from).toBe(1);
  });
});

describe('areaSeries', () => {
  it('samples the largest active shape per year', () => {
    const tl = { pids: ['x'], f: [-100, -1, 0, 10, 1, 100, 0, 30] };
    const s = areaSeries(tl, shapesByPid(tl).get('x')!, 5);
    expect(s[0]).toEqual({ year: -100, km2: 1000 });
    expect(s[s.length - 1]).toEqual({ year: 100, km2: 3000 });
    expect(s.every((p) => p.year !== 0)).toBe(true);
  });
});

describe('placeHistory at the end of the timeline', () => {
  it('keeps the last year', () => {
    const out = placeHistory([shape('a', 1900, 2024)]);
    expect(out[0].to).toBe(2024);
  });
});
