// Physical basemap from Natural Earth (public domain): land, ocean, lakes, rivers,
// plus today's country borders and names for the optional "modern borders" overlay.
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, FeatureCollection } from 'geojson';
import { download } from './lib/util';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

type Props = Record<string, unknown>;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Natural Earth min_zoom → tippecanoe minzoom. Returns null for "never show" (99). */
function minzoomOf(p: Props): number | null {
  const z = p.min_zoom ?? p.MIN_ZOOM;
  if (typeof z !== 'number') return 0;
  if (z > 10) return null;
  return Math.min(7, Math.max(0, Math.floor(z) - 1));
}

interface LayerSpec {
  layer: string;
  file: string;
  /** Turn a Natural Earth feature into the tile feature (or null to drop it). */
  map?: (f: Feature, p: Props) => (Feature & { tippecanoe?: object }) | null;
}

const LAYERS: LayerSpec[] = [
  { layer: 'land', file: 'ne_10m_land.geojson' },
  // Drawn on top of polity fills so hand-drawn borders follow the coastline.
  { layer: 'ocean', file: 'ne_10m_ocean.geojson' },
  { layer: 'lakes', file: 'ne_10m_lakes.geojson' },
  {
    layer: 'rivers',
    file: 'ne_10m_rivers_lake_centerlines.geojson',
    map: (f, p) => ({ ...f, properties: { r: num(p.scalerank, 10) } }),
  },
  { layer: 'borders', file: 'ne_10m_admin_0_boundary_lines_land.geojson', map: (f) => ({ ...f, properties: {} }) },
  {
    layer: 'countries',
    file: 'ne_50m_admin_0_countries.geojson',
    map: (_f, p) => {
      const x = num(p.LABEL_X, NaN);
      const y = num(p.LABEL_Y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        type: 'Feature',
        tippecanoe: { minzoom: Math.min(6, Math.max(0, Math.floor(num(p.MIN_LABEL, 3)) - 1)) },
        properties: { name: String(p.NAME_EN ?? p.NAME ?? ''), rank: num(p.LABELRANK, 5) },
        geometry: { type: 'Point', coordinates: [x, y] },
      };
    },
  },
];

export async function buildBasemap(rawDir: string, buildDir: string, outFile: string) {
  const args = ['-o', outFile, '--force', '-Z0', '-z7', '--no-tile-size-limit', '--detect-shared-borders', '-r1'];
  for (const spec of LAYERS) {
    const src = join(rawDir, spec.file);
    await download(`${NE}/${spec.file}`, src);
    const fc = JSON.parse(readFileSync(src, 'utf8')) as FeatureCollection;
    const out = join(buildDir, `basemap-${spec.layer}.ndjson`);
    const fd = openSync(out, 'w');
    for (const f of fc.features) {
      const p = (f.properties ?? {}) as Props;
      const minzoom = minzoomOf(p);
      if (minzoom === null) continue;
      const mapped = spec.map ? spec.map(f, p) : { ...f, properties: {} };
      if (!mapped) continue;
      const tc = mapped.tippecanoe ?? { minzoom };
      writeSync(fd, JSON.stringify({ type: 'Feature', tippecanoe: tc, properties: mapped.properties, geometry: mapped.geometry }) + '\n');
    }
    closeSync(fd);
    args.push('-L', `${spec.layer}:${out}`);
  }
  execFileSync('tippecanoe', [...args, '-P', '--quiet'], { stdio: 'inherit' });
}
