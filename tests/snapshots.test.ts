import { describe, expect, it } from 'vitest';
import { clipRange, mergeSlices, snapshotsToIntervals } from '../scripts/lib/snapshots';

describe('snapshotsToIntervals', () => {
  it('runs each snapshot until the year before the next', () => {
    expect(snapshotsToIntervals([-4000, -10000, -5000], 2024)).toEqual([
      [-10000, -5001],
      [-5000, -4001],
      [-4000, 2024],
    ]);
  });
  it('skips year 0 at the BCE/CE boundary', () => {
    expect(snapshotsToIntervals([-100, 1, 100], 200)).toEqual([
      [-100, -1],
      [1, 99],
      [100, 200],
    ]);
  });
});

describe('clipRange', () => {
  it('clips and rejects', () => {
    expect(clipRange([-5000, -3000], [-123000, -3401])).toEqual([-5000, -3401]);
    expect(clipRange([-3000, 100], [-123000, -3401])).toBeNull();
  });
});

describe('mergeSlices', () => {
  it('merges touching slices with the same key only', () => {
    const items = [
      { k: 'a', from: -750, to: -701 },
      { k: 'a', from: -700, to: -501 },
      { k: 'a', from: -400, to: -300 },
      { k: 'b', from: -700, to: -501 },
      { k: 'c', from: -10, to: -1 },
      { k: 'c', from: 1, to: 10 },
    ];
    const out = mergeSlices(items, (i) => i.k).sort((x, y) => x.k.localeCompare(y.k) || x.from - y.from);
    expect(out).toEqual([
      { k: 'a', from: -750, to: -501 },
      { k: 'a', from: -400, to: -300 },
      { k: 'b', from: -700, to: -501 },
      { k: 'c', from: -10, to: 10 },
    ]);
  });
});
