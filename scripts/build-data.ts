// Builds everything in public/data/ from the configured sources.
//   npm run build:data                 full build
//   npm run build:data -- --no-basemap skip the basemap if it already exists
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES } from '../sources.config';
import { colorIndex } from '../src/palette';
import type { PolityTileProps, SourceInfo } from '../src/types';
import { buildBasemap } from './basemap';
import { areaKm2, bounds, labelMinZoom, labelPoint } from './lib/geo';
import { SearchIndexBuilder } from './lib/search-index';
import { clipRange, mergeSlices } from './lib/snapshots';
import type { NormalizedFeature } from './sources/types';
import { ADAPTERS } from './sources';

const RAW = 'data/raw';
const BUILD = 'data/build';
const OUT = 'public/data';
const args = new Set(process.argv.slice(2));

async function main() {
  for (const d of [RAW, BUILD, OUT]) mkdirSync(d, { recursive: true });

  const polFd = openSync(join(BUILD, 'polities.ndjson'), 'w');
  const labFd = openSync(join(BUILD, 'labels.ndjson'), 'w');
  const index = new SearchIndexBuilder();
  const sourceInfo: SourceInfo[] = [];
  const problems: string[] = [];
  // Every polity shape gets a numeric id (1-based) so the app can switch it on/off with feature-state.
  // timeline.json stores [from, to, pidIndex] per id; the app reads it to decide what is visible each year.
  const pidIndex = new Map<string, number>();
  const timeline: number[] = [];
  let nextId = 1;

  for (const cfg of SOURCES.filter((s) => s.enabled)) {
    const adapter = ADAPTERS[cfg.id];
    if (!adapter) throw new Error(`No adapter registered for source "${cfg.id}"`);
    const ctx = { rawDir: join(RAW, cfg.id), window: cfg.window };
    mkdirSync(ctx.rawDir, { recursive: true });
    console.log(`[${cfg.id}] fetching`);
    await adapter.fetch(ctx);
    console.log(`[${cfg.id}] normalizing`);

    const collected: NormalizedFeature[] = [];
    for await (const f of adapter.normalize(ctx)) {
      const range = clipRange([f.from, f.to], cfg.window);
      if (!range) continue;
      const [from, to] = range;
      if (from > to || from === 0 || to === 0) {
        problems.push(`${cfg.id}: bad range ${from}..${to} for ${f.name}`);
        continue;
      }
      collected.push({ ...f, from, to });
    }
    // Consecutive slices with an unchanged shape become one feature.
    const merged = mergeSlices(collected, (f) =>
      [f.polityId, f.kind, f.overlord, f.partOf, createHash('md5').update(JSON.stringify(f.geometry)).digest('hex')].join('|'),
    );
    console.log(`[${cfg.id}] ${collected.length} slices → ${merged.length} after merging unchanged shapes`);

    let count = 0;
    for (const f of merged) {
      const { from, to } = f;
      const km2 = areaKm2(f.geometry);
      const props: PolityTileProps = {
        pid: f.polityId,
        name: f.name,
        from,
        to,
        src: f.source,
        kind: f.kind,
        conf: f.confidence,
        prio: cfg.priority,
        c: colorIndex(f.polityId),
        ...(f.overlord && { ov: f.overlord }),
        ...(f.partOf && { po: f.partOf }),
        ...(f.note && { note: f.note }),
      };
      const id = nextId++;
      if (!pidIndex.has(f.polityId)) pidIndex.set(f.polityId, pidIndex.size);
      timeline.push(from, to, pidIndex.get(f.polityId)!);
      writeSync(polFd, JSON.stringify({ type: 'Feature', id, properties: props, geometry: f.geometry }) + '\n');
      writeSync(
        labFd,
        JSON.stringify({
          type: 'Feature',
          tippecanoe: { minzoom: labelMinZoom(km2) },
          properties: { pid: f.polityId, name: f.name, from, to, kind: f.kind, src: f.source, area: Math.round(km2) },
          geometry: { type: 'Point', coordinates: labelPoint(f.geometry) },
        }) + '\n',
      );
      index.add(f.polityId, f.name, f.source, f.kind, { from, to, area: km2, bbox: bounds(f.geometry) }, f.wikipedia, f.wikidata);
      count++;
    }
    console.log(`[${cfg.id}] ${count} features`);
    sourceInfo.push({
      id: adapter.id,
      title: adapter.title,
      url: adapter.url,
      license: adapter.license,
      attribution: adapter.attribution,
      window: cfg.window,
      features: count,
    });
  }
  closeSync(polFd);
  closeSync(labFd);

  if (problems.length) {
    console.warn(`${problems.length} features skipped:\n  ${problems.slice(0, 20).join('\n  ')}`);
  }

  const polities = index.build();
  writeFileSync(join(OUT, 'polities.json'), JSON.stringify(polities));
  writeFileSync(join(OUT, 'sources.json'), JSON.stringify(sourceInfo, null, 2));
  writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ pids: [...pidIndex.keys()], f: timeline }));
  console.log(`index: ${polities.length} polities`);

  // Every feature must survive at every zoom: the year decides what is visible, not tippecanoe.
  const keepAll = ['--no-feature-limit', '--no-tile-size-limit', '--no-tiny-polygon-reduction', '-r1', '-P', '--quiet'];
  console.log('tiling polities (tippecanoe)…');
  execFileSync(
    'tippecanoe',
    [
      '-o', join(OUT, 'polities.pmtiles'), '--force', '-Z0', '-z8', '-l', 'polities',
      // Detail vs. size: world-view tiles end up around 1.8 MB (gzipped) with these settings.
      '--simplification=5', '--low-detail=11', ...keepAll, join(BUILD, 'polities.ndjson'),
    ],
    { stdio: 'inherit' },
  );
  // Labels live in their own small tileset: their year filter re-processes only these light tiles.
  console.log('tiling labels (tippecanoe)…');
  execFileSync(
    'tippecanoe',
    ['-o', join(OUT, 'labels.pmtiles'), '--force', '-Z0', '-z8', '-l', 'labels', ...keepAll, join(BUILD, 'labels.ndjson')],
    { stdio: 'inherit' },
  );

  const basemap = join(OUT, 'basemap.pmtiles');
  if (!(args.has('--no-basemap') && existsSync(basemap))) {
    console.log('building basemap…');
    await buildBasemap(join(RAW, 'natural-earth'), BUILD, basemap);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
