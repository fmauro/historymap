import { join } from 'node:path';
import { MAX_YEAR, MIN_YEAR, addYears, formatYear } from '../../src/years';
import { isLifeway } from '../lib/classify';
import { clipRange } from '../lib/snapshots';
import { HB_ID, historicalBasemaps, plan, snapshotFeatures } from './historical-basemaps';
import { applyFix } from './historical-basemaps-fixes';
import type { NormalizedFeature, SourceAdapter, SourceContext } from './types';

// historical-basemaps is a series of snapshots, and a people drawn in one snapshot is sometimes
// left out of the next (the Sahara is blank from 1 to 500 CE, the Amazon from 100 to 900 CE).
// This source carries the *peoples and cultures* of each snapshot into the neighbouring periods.
// It sits below the real sources, so a carried shape only shows where nothing else is drawn at that time.
// States are not carried: they begin and end at specific dates.

/**
 * How far a shape may be carried beyond its own snapshot period. Ways of life ("hunter-gatherers")
 * last for millennia; a named people or archaeological culture only for a few centuries.
 */
function carryYears(name: string, target: [number, number]): number {
  if (!isLifeway(name)) return 300;
  // Prehistoric snapshots are thousands of years apart, and ways of life changed slowly then.
  // The Arctic is the exception: it was only settled around 2500 BCE.
  return target[0] < -3000 && !/arctic|inuit/i.test(name) ? 3000 : 1000;
}

export const historicalBasemapsCarried: SourceAdapter = {
  id: 'historical-basemaps-carried',
  title: 'historical-basemaps, extended to neighbouring periods',
  url: historicalBasemaps.url,
  license: historicalBasemaps.license,
  attribution: historicalBasemaps.attribution,

  async fetch(ctx: SourceContext) {
    await historicalBasemaps.fetch({ ...ctx, rawDir: hbDir(ctx), window: [MIN_YEAR, MAX_YEAR] });
  },

  async *normalize(ctx: SourceContext): AsyncIterable<NormalizedFeature> {
    const dir = hbDir(ctx);
    const snaps = plan(dir, [MIN_YEAR, MAX_YEAR]);
    const cultures = snaps.map((snap) => [...snapshotFeatures(dir, snap)].filter((f) => f.kind === 'culture'));
    // Fill each period from the nearest snapshots first: k = 1 are the neighbours (tier 0),
    // k = 2 the next ones out (tier 1, drawn beneath), and so on.
    for (let j = 0; j < snaps.length; j++) {
      const target = snaps[j].range;
      for (let k = 1; k < snaps.length; k++) {
        let any = false;
        for (const i of [j - k, j + k]) {
          const snap = snaps[i];
          if (!snap) continue;
          for (const f of cultures[i]) {
            // Only the part of the target period close enough to the snapshot's own period.
            const reach = carryYears(f.name, target);
            const limit: [number, number] =
              i > j ? [addYears(snap.range[0], -reach), MAX_YEAR] : [MIN_YEAR, addYears(snap.range[1], reach)];
            const carried = clipRange(target, limit);
            const range = carried && clipRange(carried, ctx.window);
            if (!range) continue;
            any = true;
            const carriedFeature = applyFix({
              ...f,
              from: range[0],
              to: range[1],
              source: 'historical-basemaps-carried',
              confidence: 'low',
              tier: k - 1,
              note: `historical-basemaps leaves this area blank here, so its ${formatYear(snap.year)} map is shown. Treat it as a rough guide.`,
            });
            if (carriedFeature) yield carriedFeature;
          }
        }
        if (!any) break;
      }
    }
  },
};

/** Reuses the historical-basemaps downloads. */
const hbDir = (ctx: SourceContext) => join(ctx.rawDir, '..', HB_ID);
