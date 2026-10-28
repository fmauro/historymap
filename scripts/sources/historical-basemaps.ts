import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { clipRange, snapshotsToIntervals } from '../lib/snapshots';
import { download, slug, wikiTitleFromUrl } from '../lib/util';
import type { NormalizedFeature, SourceAdapter, SourceContext } from './types';

const BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master';

interface IndexEntry { year: number; filename: string }

interface HbProps {
  NAME: string | null;
  type?: string | null;
  weblnks?: string | null;
  SUBJECTO?: string | null;
  PARTOF?: string | null;
  BORDERPRECISION?: number | null;
}

const CONFIDENCE = { 1: 'low', 2: 'medium', 3: 'high' } as const;

function readIndex(rawDir: string): IndexEntry[] {
  return (JSON.parse(readFileSync(join(rawDir, 'index.json'), 'utf8')) as { years: IndexEntry[] }).years;
}

/** Snapshots with the year range each one covers, limited to the window. */
function plan(ctx: SourceContext) {
  const entries = readIndex(ctx.rawDir).sort((a, b) => a.year - b.year);
  const ranges = snapshotsToIntervals(entries.map((e) => e.year));
  return entries
    .map((e, i) => ({ ...e, range: clipRange(ranges[i], ctx.window) }))
    .filter((e): e is IndexEntry & { range: [number, number] } => e.range !== null);
}

export const historicalBasemaps: SourceAdapter = {
  id: 'historical-basemaps',
  title: 'historical-basemaps (André Ourednik)',
  url: 'https://github.com/aourednik/historical-basemaps',
  license: 'GPL-3.0',
  attribution: 'historical-basemaps © André Ourednik et al., GPL-3.0',

  async fetch(ctx: SourceContext) {
    await download(`${BASE}/index.json`, join(ctx.rawDir, 'index.json'));
    for (const e of plan(ctx)) await download(`${BASE}/geojson/${e.filename}`, join(ctx.rawDir, e.filename));
  },

  async *normalize(ctx: SourceContext): AsyncIterable<NormalizedFeature> {
    for (const e of plan(ctx)) {
      const fc = JSON.parse(readFileSync(join(ctx.rawDir, e.filename), 'utf8')) as FeatureCollection<
        Polygon | MultiPolygon,
        HbProps
      >;
      for (const f of fc.features) {
        const p = f.properties;
        const name = p?.NAME?.trim();
        // Unnamed shapes are unclaimed land in this dataset.
        if (!name || !f.geometry) continue;
        if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
        const overlord = p.SUBJECTO?.trim();
        const partOf = p.PARTOF?.trim();
        yield {
          polityId: slug(name),
          name,
          from: e.range[0],
          to: e.range[1],
          source: 'historical-basemaps',
          kind: p.type?.toLowerCase().includes('culture') ? 'culture' : 'polity',
          confidence: CONFIDENCE[(p.BORDERPRECISION ?? 1) as 1 | 2 | 3] ?? 'low',
          wikipedia: wikiTitleFromUrl(p.weblnks),
          overlord: overlord && overlord !== name ? overlord : undefined,
          partOf: partOf && partOf !== name && partOf !== overlord ? partOf : undefined,
          geometry: f.geometry,
        };
      }
    }
  },
};
