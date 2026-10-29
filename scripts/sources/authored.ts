import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { fixRange } from '../../src/years';
import { slug } from '../lib/util';
import type { NormalizedFeature, SourceAdapter, SourceContext } from './types';

// Hand-written gap-filling data in data/authored/*.geojson.
// Shapes are approximate by nature, so confidence is capped at "medium" and defaults to "low".
export const AUTHORED_DIR = 'data/authored';

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z.array(position).min(4);
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);

export const authoredFeature = z.object({
  type: z.literal('Feature'),
  properties: z
    .object({
      name: z.string().min(1),
      from: z.number().int(),
      to: z.number().int(),
      kind: z.enum(['polity', 'culture']).default('culture'),
      confidence: z.enum(['low', 'medium']).default('low'),
      wikipedia: z.string().optional(),
      wikidata: z.string().optional(),
      overlord: z.string().optional(),
      partOf: z.string().optional(),
      note: z.string().optional(),
      /** 1 = background shape (e.g. a way of life) drawn beneath tier-0 shapes, only filling their gaps. */
      tier: z.number().int().min(0).max(3).optional(),
    })
    .refine((p) => p.from <= p.to, { message: 'from must be <= to' }),
  geometry,
});

const collection = z.object({ type: z.literal('FeatureCollection'), features: z.array(authoredFeature) });

export const authored: SourceAdapter = {
  id: 'authored',
  title: 'HistoryMap authored data',
  url: '', // no external home: the data lives in data/authored/
  license: 'GPL-3.0',
  attribution: 'Approximate gap-filling shapes by the HistoryMap project',

  async fetch() {},

  async *normalize(_ctx: SourceContext): AsyncIterable<NormalizedFeature> {
    if (!existsSync(AUTHORED_DIR)) return;
    for (const file of readdirSync(AUTHORED_DIR).filter((f) => f.endsWith('.geojson')).sort()) {
      const raw = JSON.parse(readFileSync(join(AUTHORED_DIR, file), 'utf8'));
      const parsed = collection.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      for (const f of parsed.data.features) {
        const p = f.properties;
        const [from, to] = fixRange(p.from, p.to);
        yield {
          polityId: slug(p.name),
          name: p.name,
          from,
          to,
          source: 'authored',
          kind: p.kind,
          confidence: p.confidence,
          wikipedia: p.wikipedia,
          wikidata: p.wikidata,
          overlord: p.overlord,
          partOf: p.partOf,
          note: p.note ?? 'Approximate extent, drawn by hand to fill a gap in the datasets.',
          tier: p.tier,
          geometry: f.geometry,
        };
      }
    }
  },
};
