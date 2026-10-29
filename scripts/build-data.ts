// Builds everything in public/data/ from the configured sources.
//   npm run build:data                 full build
//   npm run build:data -- --no-basemap skip the basemap if it already exists
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { SOURCES } from '../sources.config';
import { colorIndex } from '../src/palette';
import type { PolityTileProps, SourceInfo } from '../src/types';
import { buildBasemap } from './basemap';
import { ColorPlanner } from './lib/colors';
import { Coverage } from './lib/coverage';
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
  // timeline.json stores [from, to, pidIndex, visible area in 100 km²] per id; the app reads it to decide what is visible each year.
  const pidIndex = new Map<string, number>();
  const timeline: number[] = [];
  let nextId = 1;
  // What higher-priority sources already cover, by time. Lower sources only fill the gaps.
  const coverage = new Coverage();
  // Neighbouring polities get different colors; decided once all shapes are known.
  const colorPlanner = new ColorPlanner();

  for (const cfg of SOURCES.filter((s) => s.enabled).sort((a, b) => b.priority - a.priority)) {
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
      [f.polityId, f.kind, f.overlord, f.partOf, f.tier, createHash('md5').update(JSON.stringify(f.geometry)).digest('hex')].join('|'),
    );
    console.log(`[${cfg.id}] ${collected.length} slices → ${merged.length} after merging unchanged shapes`);

    // Tiers are layered like sources: each one only fills what the ones above leave empty.
    // Their priority stays within the source's band (30 → 30, 29.99, …), above the next source.
    const tiers = [...new Set(merged.map((f) => f.tier ?? 0))].sort((a, b) => a - b);
    let count = 0;
    let hidden = 0;
    const hiddenAuthored: string[] = [];
    for (const tier of tiers) {
      const shapes = merged.filter((f) => (f.tier ?? 0) === tier);
      const analysis = coverage.analyze(shapes);
      shapes.forEach((f, i) => {
        const { from, to } = f;
        const a = analysis[i];
        if (a.hidden) {
          hidden++;
          if (f.source === 'authored') hiddenAuthored.push(`${f.name} (${f.from}..${f.to})`);
          return;
        }
        const km2 = areaKm2(f.geometry);
        const props: PolityTileProps = {
          pid: f.polityId,
          name: f.name,
          from,
          to,
          src: f.source,
          kind: f.kind,
          conf: f.confidence,
          prio: cfg.priority - tier / 100,
          c: colorIndex(f.polityId),
          ...(f.overlord && { ov: f.overlord }),
          ...(f.partOf && { po: f.partOf }),
          ...(f.note && { note: f.note }),
        };
        const id = nextId++;
        if (!pidIndex.has(f.polityId)) pidIndex.set(f.polityId, pidIndex.size);
        // Visible area: the part not hidden under higher-priority sources (used for size charts and rankings).
        timeline.push(from, to, pidIndex.get(f.polityId)!, Math.round((km2 * a.visibleShare) / 100));
        writeSync(polFd, JSON.stringify({ type: 'Feature', id, properties: props, geometry: f.geometry }) + '\n');
        // A shape partly hidden by higher sources can have several label spans, placed in its visible part.
        // Fully visible spans also label the shape's other big parts.
        const fullSpan = a.labels.find((l) => l.full);
        const extra = fullSpan ? coverage.spreadLabels(f.geometry, fullSpan.point) : [];
        for (const l of a.labels) {
          const spots = [{ point: l.point, km2: l.km2, extra: false }, ...(l.full ? extra.map((e) => ({ ...e, extra: true })) : [])];
          for (const { point, km2, extra: isExtra } of spots) {
            writeSync(
              labFd,
              JSON.stringify({
                type: 'Feature',
                // Extra labels repeat the name, so they wait until the map is zoomed in a little.
                tippecanoe: { minzoom: isExtra ? Math.max(3, labelMinZoom(km2) + 1) : labelMinZoom(km2) },
                properties: { pid: f.polityId, name: f.name, from: l.from, to: l.to, kind: f.kind, src: f.source, area: Math.round(km2) },
                geometry: { type: 'Point', coordinates: point },
              }) + '\n',
            );
          }
        }
        const inside = (a.labels.find((l) => l.full) ?? a.labels[0])?.point ?? labelPoint(f.geometry);
        index.add(
          f.polityId, f.name, f.source, f.kind,
          { from, to, area: km2, bbox: bounds(f.geometry), point: inside as [number, number] },
          f.wikipedia, f.wikidata,
        );
        if (f.kind !== 'relation') {
          coverage.add(f);
          colorPlanner.add(f.polityId, from, to, cfg.priority - tier / 100, f.geometry);
        }
        count++;
      });
    }
    if (hidden) console.log(`[${cfg.id}] ${hidden} shapes dropped: hidden under higher-priority sources`);
    // Hand-drawn shapes are written on purpose, so say which ones never show.
    if (hiddenAuthored.length) console.log(`  never visible: ${hiddenAuthored.join(', ')}`);
    console.log(`[${cfg.id}] ${count} features`);
    sourceInfo.push({
      id: adapter.id,
      title: adapter.title,
      url: adapter.url,
      license: adapter.license,
      attribution: adapter.attribution,
      window: cfg.window,
      priority: cfg.priority,
      features: count,
    });
  }
  closeSync(polFd);
  closeSync(labFd);

  if (problems.length) {
    console.warn(`${problems.length} features skipped:\n  ${problems.slice(0, 20).join('\n  ')}`);
  }

  // Colors: the shapes were written with their hashed color; rewrite with the planned one.
  const { colors, clashBefore, clashAfter } = colorPlanner.assign();
  console.log(`colors: how alike neighbours look ${(clashBefore * 100).toFixed(1)}% → ${(clashAfter * 100).toFixed(1)}%`);
  await recolor(join(BUILD, 'polities.ndjson'), colors);

  const polities = index.build().map((p) => ({ ...p, c: colors.get(p.id) ?? colorIndex(p.id) }));
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

/** Replace the color index ("c") of every feature in an ndjson file. */
async function recolor(file: string, colors: Map<string, number>) {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w');
  for await (const line of createInterface({ input: createReadStream(file) })) {
    if (!line) continue;
    const pid = /"pid":"([^"]*)"/.exec(line)?.[1];
    const c = pid !== undefined ? colors.get(pid) : undefined;
    writeSync(fd, (c === undefined ? line : line.replace(/"c":\d+/, `"c":${c}`)) + '\n');
  }
  closeSync(fd);
  renameSync(tmp, file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
