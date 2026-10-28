import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { fixRange } from '../../src/years';
import { download, slug, unzip } from '../lib/util';
import type { NormalizedFeature, SourceAdapter, SourceContext } from './types';

const ZIP_URL = 'https://github.com/Seshat-Global-History-Databank/cliopatria/raw/main/cliopatria.geojson.zip';

interface ClioProps {
  Name: string;
  FromYear: number;
  ToYear: number;
  Type: 'POLITY' | 'RELATION';
  Wikipedia?: string;
  Wikidata?: string;
  MemberOf?: string;
}

function findGeojson(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const f = readdirSync(dir).find((n) => n.endsWith('.geojson'));
  return f && join(dir, f);
}

export const cliopatria: SourceAdapter = {
  id: 'cliopatria',
  title: 'Cliopatria (Seshat Global History Databank)',
  url: 'https://github.com/Seshat-Global-History-Databank/cliopatria',
  license: 'CC BY 4.0',
  attribution: 'Cliopatria © Seshat Global History Databank, CC BY 4.0',

  async fetch(ctx: SourceContext) {
    if (findGeojson(ctx.rawDir)) return;
    const zip = join(ctx.rawDir, 'cliopatria.geojson.zip');
    await download(ZIP_URL, zip);
    unzip(zip, ctx.rawDir);
  },

  async *normalize(ctx: SourceContext): AsyncIterable<NormalizedFeature> {
    const file = findGeojson(ctx.rawDir);
    if (!file) throw new Error('Cliopatria GeoJSON not found; fetch first');
    const fc = JSON.parse(readFileSync(file, 'utf8')) as FeatureCollection<Polygon | MultiPolygon, ClioProps>;
    for (const f of fc.features as Feature<Polygon | MultiPolygon, ClioProps>[]) {
      const p = f.properties;
      if (!p?.Name || !f.geometry) continue;
      if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
      const [from, to] = fixRange(p.FromYear, p.ToYear);
      // Relation names are wrapped in parentheses, e.g. "(Alliance between Elam and Babylonia)".
      const name = p.Name.replace(/^\((.*)\)$/, '$1');
      yield {
        polityId: slug(name),
        name,
        from,
        to,
        source: 'cliopatria',
        kind: p.Type === 'RELATION' ? 'relation' : 'polity',
        confidence: 'high',
        wikipedia: p.Wikipedia || undefined,
        wikidata: p.Wikidata || undefined,
        partOf: p.MemberOf ? p.MemberOf.replace(/^\((.*)\)$/, '$1') : undefined,
        geometry: f.geometry,
      };
    }
  },
};
