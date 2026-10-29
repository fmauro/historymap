import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre finds its worker relative to its own file, which breaks once Vite bundles it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { PALETTE, mix } from './palette';
import { TIMELINE_STRIDE as S, type SourceInfo, type TimelineData } from './types';

const DATA = `${import.meta.env.BASE_URL}data`;
const abs = (p: string) => new URL(p, window.location.href).href;

const OCEAN = '#c3d3d9';
const LAND = '#efe7d4';
const INK = '#3b2f1e';

// Polity shapes are switched on per year with feature-state ("on"), which only updates paint.
// Changing a filter would make MapLibre re-process every heavy polity tile (~0.5 s per year step).
const ON: ExpressionSpecification = ['boolean', ['feature-state', 'on'], false];
const SELECTED: ExpressionSpecification = ['all', ON, ['boolean', ['feature-state', 'sel'], false]];
const HOVERED: ExpressionSpecification = ['all', ON, ['boolean', ['feature-state', 'hover'], false]];
/** Labels are light points in their own tileset, so a plain year filter on them is cheap. */
const ACTIVE: ExpressionSpecification = [
  'all',
  ['<=', ['get', 'from'], ['global-state', 'year']],
  ['>=', ['get', 'to'], ['global-state', 'year']],
];
const NOT_RELATION: ExpressionSpecification = ['!=', ['get', 'kind'], 'relation'];
const IS_CULTURE: ExpressionSpecification = ['==', ['get', 'kind'], 'culture'];

// Fills are opaque, pre-blended with the land color. That way a higher-priority source fully hides
// lower ones where they overlap, and lower sources only show in the gaps.
const tint = (t: number): ExpressionSpecification => ['to-color', ['at', ['get', 'c'], ['literal', PALETTE.map((c) => mix(LAND, c, t))]]];
const FILL_COLOR: ExpressionSpecification = [
  'case',
  IS_CULTURE, tint(0.34), // peoples and cultures: pale
  ['==', ['get', 'conf'], 'low'], tint(0.5),
  tint(0.62),
];

/** One group of layers per source, stacked by priority. */
interface Group { src: string; prio: number }
const fillId = (g: Group) => `fill-${g.src}`;

function polityLayers(g: Group): LayerSpecification[] {
  const base = { source: 'polities', 'source-layer': 'polities' } as const;
  const mine: ExpressionSpecification = ['==', ['get', 'src'], g.src];
  const hatched = g.src === 'authored';
  return [
    {
      ...base, id: fillId(g), type: 'fill', filter: ['all', mine, NOT_RELATION],
      layout: { 'fill-sort-key': ['get', 'prio'] }, // tiers within a source
      paint: { 'fill-color': hatched ? tint(0.25) : FILL_COLOR, 'fill-opacity': ['case', ON, 1, 0], 'fill-antialias': false },
    },
    // Approximate, hand-drawn shapes get diagonal hatching on top of their tint.
    ...(hatched
      ? [{ ...base, id: `hatch-${g.src}`, type: 'fill', filter: mine, paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['case', ON, 1, 0] } } as LayerSpecification]
      : []),
    {
      ...base, id: `line-${g.src}`, type: 'line', filter: ['all', mine, NOT_RELATION],
      paint: {
        'line-opacity': ['case', ON, 1, 0],
        'line-color': ['case', IS_CULTURE, 'rgba(70, 50, 25, 0.25)', 'rgba(70, 50, 25, 0.55)'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.2],
        ...(hatched && { 'line-dasharray': [3, 2] }),
      },
    },
    {
      ...base, id: `selected-${g.src}`, type: 'line', filter: mine,
      paint: {
        'line-opacity': ['case', SELECTED, 1, HOVERED, 0.45, 0],
        'line-color': '#8a2b0e',
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.8, 6, 3.2],
      },
    },
  ];
}
const MODERN_LAYERS = ['modern-borders', 'modern-labels'];
const MODERN_INK = '#7a2e4d';

function style(year: number, groups: Group[]): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    state: { year: { default: year } },
    sources: {
      basemap: { type: 'vector', url: `pmtiles://${abs(`${DATA}/basemap.pmtiles`)}`, attribution: 'Natural Earth' },
      polities: { type: 'vector', url: `pmtiles://${abs(`${DATA}/polities.pmtiles`)}` },
      labels: { type: 'vector', url: `pmtiles://${abs(`${DATA}/labels.pmtiles`)}` },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': OCEAN } },
      { id: 'land', type: 'fill', source: 'basemap', 'source-layer': 'land', paint: { 'fill-color': LAND } },
      ...groups.flatMap(polityLayers),
      // Water is drawn over the polities so their (often rough) borders follow real coastlines.
      { id: 'ocean-mask', type: 'fill', source: 'basemap', 'source-layer': 'ocean', paint: { 'fill-color': OCEAN } },
      {
        id: 'coastline', type: 'line', source: 'basemap', 'source-layer': 'ocean',
        paint: { 'line-color': 'rgba(90, 120, 135, 0.35)', 'line-width': 0.6 },
      },
      { id: 'lakes', type: 'fill', source: 'basemap', 'source-layer': 'lakes', paint: { 'fill-color': OCEAN } },
      {
        id: 'rivers', type: 'line', source: 'basemap', 'source-layer': 'rivers',
        paint: { 'line-color': '#9fb8c2', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 7, 1.4] },
      },
      // Modern borders, toggled from the map controls for orientation.
      {
        id: 'modern-borders', type: 'line', source: 'basemap', 'source-layer': 'borders',
        layout: { visibility: 'none' },
        paint: {
          'line-color': MODERN_INK,
          'line-opacity': 0.7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 6, 1.4],
          'line-dasharray': [4, 2],
        },
      },
      {
        id: 'modern-labels', type: 'symbol', source: 'basemap', 'source-layer': 'countries',
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 6, 13],
          'symbol-sort-key': ['get', 'rank'],
          'text-max-width': 7,
        },
        paint: { 'text-color': MODERN_INK, 'text-halo-color': 'rgba(255, 255, 255, 0.8)', 'text-halo-width': 1.2 },
      },
      {
        id: 'labels', type: 'symbol', source: 'labels', 'source-layer': 'labels',
        filter: ['all', ACTIVE, NOT_RELATION],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['case', IS_CULTURE, ['literal', ['Noto Sans Italic']], ['literal', ['Noto Sans Medium']]],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            1, ['step', ['get', 'area'], 9, 300000, 10, 1500000, 12],
            6, ['step', ['get', 'area'], 12, 50000, 14, 300000, 17],
          ],
          'text-transform': ['case', ['>', ['get', 'area'], 500000], 'uppercase', 'none'],
          'text-letter-spacing': ['case', ['>', ['get', 'area'], 500000], 0.08, 0.02],
          'text-max-width': 8,
          'symbol-sort-key': ['-', 0, ['get', 'area']],
          'text-padding': 4,
        },
        paint: {
          'text-color': ['case', ['any', IS_CULTURE, ['==', ['get', 'src'], 'authored']], '#6b5536', INK],
          'text-halo-color': 'rgba(245, 238, 222, 0.85)',
          'text-halo-width': 1.4,
        },
      },
    ],
  };
}

/** Diagonal hatching used for approximate (authored) shapes. */
function hatchImage(): ImageData {
  const size = 16;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(140, 95, 45, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const o of [-size, 0, size]) {
    ctx.moveTo(o, size);
    ctx.lineTo(o + size, 0);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** A map button that toggles something on and off. */
class ToggleControl implements maplibregl.IControl {
  private el!: HTMLDivElement;
  constructor(
    private icon: string,
    private title: string,
    private get: () => boolean,
    private set: (on: boolean) => void,
  ) {}
  onAdd() {
    this.el = document.createElement('div');
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle-btn';
    b.title = this.title;
    b.setAttribute('aria-label', this.title);
    b.innerHTML = this.icon;
    b.setAttribute('aria-pressed', String(this.get()));
    b.onclick = () => {
      this.set(!this.get());
      b.setAttribute('aria-pressed', String(this.get()));
    };
    this.el.appendChild(b);
    return this.el;
  }
  onRemove() {
    this.el.remove();
  }
}

export interface MapOptions {
  year: number;
  center: [number, number];
  zoom: number;
  globe: boolean;
  modern: boolean;
  timeline: TimelineData;
  sources: SourceInfo[];
  attribution: string[];
  /** Called when the globe or modern-borders toggle changes. */
  onToggle?: () => void;
}

const GLOBE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="7.5"/><ellipse cx="10" cy="10" rx="3.2" ry="7.5"/><path d="M2.5 10h15M4 6h12M4 14h12"/></svg>`;
const BORDERS_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 1.5"><path d="M3 4l5 2 4-2 5 2v10l-5-2-4 2-5-2z"/><path d="M8 6v10M12 4v10"/></svg>`;

/** Fill layers that hold polity shapes, topmost first. Set when the map is created. */
export let polityLayerIds: string[] = [];

export function createMap(container: string, opts: MapOptions) {
  maplibregl.setWorkerUrl(workerUrl);
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const groups = opts.sources
    .filter((s) => s.features > 0)
    .map((s) => ({ src: s.id, prio: s.priority }))
    .sort((a, b) => a.prio - b.prio);
  polityLayerIds = groups.map(fillId).reverse(); // topmost first
  const map = new maplibregl.Map({
    container,
    style: style(opts.year, groups),
    center: opts.center,
    zoom: opts.zoom,
    minZoom: 0.5,
    maxZoom: 10,
    attributionControl: false,
    renderWorldCopies: true,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: opts.attribution }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right');

  let globe = opts.globe;
  let modern = opts.modern;
  const applyProjection = () => map.setProjection({ type: globe ? 'globe' : 'mercator' });
  const applyModern = () => {
    for (const id of MODERN_LAYERS) map.setLayoutProperty(id, 'visibility', modern ? 'visible' : 'none');
  };
  map.addControl(
    new ToggleControl(GLOBE_ICON, 'Globe view', () => globe, (on) => {
      globe = on;
      applyProjection();
      opts.onToggle?.();
    }),
    'top-right',
  );
  map.addControl(
    new ToggleControl(BORDERS_ICON, "Show today's country borders", () => modern, (on) => {
      modern = on;
      applyModern();
      opts.onToggle?.();
    }),
    'top-right',
  );
  map.on('style.load', () => {
    applyProjection();
    applyModern();
  });
  map.on('styleimagemissing', (e) => {
    if (e.id === 'hatch' && !map.hasImage('hatch')) map.addImage('hatch', hatchImage(), { pixelRatio: 2 });
  });

  // Which polity shapes are on. Index i is feature id i + 1.
  const tl = opts.timeline;
  const n = tl.f.length / S;
  const on = new Uint8Array(n);
  const idsByPid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const pid = tl.pids[tl.f[i * S + 2]];
    if (!idsByPid.has(pid)) idsByPid.set(pid, []);
    idsByPid.get(pid)!.push(i + 1);
  }
  const target = (id: number) => ({ source: 'polities', sourceLayer: 'polities', id });
  let year = opts.year;
  let selected: string | null = null;
  let hovered: string | null = null;
  const mark = (pid: string | null, state: 'sel' | 'hover', value: boolean) => {
    for (const id of (pid && idsByPid.get(pid)) || []) map.setFeatureState(target(id), { [state]: value });
  };

  const applyYear = () => {
    for (let i = 0; i < n; i++) {
      const active = tl.f[i * S] <= year && year <= tl.f[i * S + 1] ? 1 : 0;
      if (active !== on[i]) {
        on[i] = active;
        map.setFeatureState(target(i + 1), { on: active === 1 });
      }
    }
    map.setGlobalStateProperty('year', year);
  };
  // Feature-state can be set once the style has loaded; until then only remember the year.
  let ready = false;
  map.on('load', () => {
    ready = true;
    applyYear();
  });

  return {
    map,
    isGlobe: () => globe,
    isModern: () => modern,
    setYear(y: number) {
      year = y;
      if (ready) applyYear();
    },
    setSelected(pid: string | null) {
      if (pid === selected) return;
      mark(selected, 'sel', false);
      selected = pid;
      mark(pid, 'sel', true);
    },
    setHovered(pid: string | null) {
      if (pid === hovered) return;
      mark(hovered, 'hover', false);
      hovered = pid;
      mark(pid, 'hover', true);
    },
  };
}

export type HistoryMap = ReturnType<typeof createMap>;
