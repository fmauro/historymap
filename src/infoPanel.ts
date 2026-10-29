import type { MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import { areaSeries, placeHistory, shapesByPid, type PlaceShape, type Segment } from './history';
import type { HistoryMap } from './map';
import { polityLayerIds } from './map';
import { PALETTE } from './palette';
import { store } from './store';
import { yearToT } from './timescale';
import { TIMELINE_STRIDE as S, type PolityIndexEntry, type PolityTileProps, type SourceInfo, type TimelineData } from './types';
import { formatRange, formatYear } from './years';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const KIND_LABEL: Record<string, string> = { polity: 'State', culture: 'Culture / people', relation: 'Alliance' };
const CONF_LABEL: Record<string, string> = { high: 'Well documented', medium: 'Approximate', low: 'Rough extent' };

interface WikiSummary { extract?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }
const wikiCache = new Map<string, Promise<WikiSummary | null>>();

function wikiSummary(title: string): Promise<WikiSummary | null> {
  if (!wikiCache.has(title)) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    wikiCache.set(
      title,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return wikiCache.get(title)!;
}

function formatKm2(km2: number): string {
  if (km2 >= 1e6) return `${(km2 / 1e6).toFixed(km2 >= 1e7 ? 0 : 1)} million km²`;
  if (km2 >= 1e4) return `${Math.round(km2 / 1e3).toLocaleString('en')},000 km²`;
  return `${Math.round(km2).toLocaleString('en')} km²`;
}

/** Small area chart of a polity's size over its lifetime. Click to jump to that year. */
function sizeChart(series: Array<{ year: number; km2: number }>, year: number, color: string): string {
  const peak = series.reduce((a, b) => (b.km2 > a.km2 ? b : a), series[0]);
  if (!peak || peak.km2 <= 0 || series.length < 3) return '';
  const w = 300, h = 54;
  const first = series[0].year, last = series[series.length - 1].year;
  const x = (y: number) => ((y - first) / Math.max(1, last - first)) * w;
  const yv = (km2: number) => h - 2 - (km2 / peak.km2) * (h - 6);
  const pts = series.map((p) => `${x(p.year).toFixed(1)},${yv(p.km2).toFixed(1)}`);
  const area = `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  const inRange = year >= first && year <= last;
  return `
    <div class="section">
      <div class="section-title">Size over time <span class="muted">· peak ${esc(formatKm2(peak.km2))} in ${esc(formatYear(peak.year))}</span></div>
      <svg class="size-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" data-first="${first}" data-last="${last}" role="img" aria-label="Area over time">
        <path d="${area}" fill="${color}" fill-opacity="0.55" stroke="${color}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
        ${inRange ? `<line x1="${x(year)}" x2="${x(year)}" y1="0" y2="${h}" class="now-line" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      <div class="chart-axis"><span>${esc(formatYear(first))}</span><span>${esc(formatYear(last))}</span></div>
    </div>`;
}

/** A strip of who held this spot, plus the list. */
function placeSection(segs: Segment[], year: number, selected: string): string {
  if (segs.length < 2) return '';
  const t0 = yearToT(segs[0].from);
  const t1 = yearToT(segs[segs.length - 1].to);
  const pos = (y: number) => ((yearToT(y) - t0) / Math.max(1e-9, t1 - t0)) * 100;
  const band = segs
    .map(
      (s) =>
        `<button class="band-seg${s.kind === 'culture' ? ' culture' : ''}" data-year="${midYear(s)}" data-pid="${esc(s.pid)}" title="${esc(`${s.name}, ${formatRange(s.from, s.to)}`)}" style="left:${pos(s.from)}%;width:${Math.max(0.4, pos(s.to) - pos(s.from))}%;background:${PALETTE[s.c]}"></button>`,
    )
    .join('');
  const marker = year >= segs[0].from && year <= segs[segs.length - 1].to ? `<div class="band-now" style="left:${pos(year)}%"></div>` : '';
  const items = segs
    .map((s) => {
      const now = s.from <= year && year <= s.to;
      return `<li class="${now ? 'now' : ''}${s.pid === selected ? ' sel' : ''}">
        <button class="place-item" data-year="${midYear(s)}" data-pid="${esc(s.pid)}">
          <span class="swatch" style="background:${PALETTE[s.c]}"></span><span class="place-name${s.kind === 'culture' ? ' culture' : ''}">${esc(s.name)}</span>
          <span class="place-years">${esc(formatRange(s.from, s.to))}</span>
        </button></li>`;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-title">History of this place</div>
      <div class="band">${band}${marker}</div>
      <ol class="place-list">${items}</ol>
    </div>`;
}

/** Year to jump to for a segment: its middle, avoiding year 0. */
function midYear(s: Segment): number {
  const m = Math.round((s.from + s.to) / 2);
  return m === 0 ? 1 : m;
}

export function initInfoPanel(hm: HistoryMap, polities: Map<string, PolityIndexEntry>, sources: SourceInfo[], timeline: TimelineData) {
  const { map } = hm;
  const panel = document.getElementById('info')!;
  const body = document.getElementById('info-body')!;
  const tooltip = document.getElementById('tooltip')!;
  const byPid = shapesByPid(timeline);
  document.getElementById('info-close')!.addEventListener('click', () => store.select(null));

  /** Every polity shape under a point, from all years (shapes of other years are on the map, just invisible). */
  const allAt = (point: PointLike): MapGeoJSONFeature[] => {
    const seen = new Set<number | string>();
    return (map.queryRenderedFeatures(point, { layers: polityLayerIds }) as MapGeoJSONFeature[]).filter((f) => {
      const key = f.id ?? `${f.properties.pid}:${f.properties.from}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  /** Polities shown at a point in the current year, topmost first. */
  const featuresAt = (point: PointLike): PolityTileProps[] => {
    const seen = new Set<string>();
    const out: PolityTileProps[] = [];
    let top = -Infinity;
    for (const f of allAt(point).sort((a, b) => (b.properties.prio as number) - (a.properties.prio as number))) {
      const p = f.properties as PolityTileProps;
      if (p.from > store.year || p.to < store.year || seen.has(p.pid)) continue;
      // Lower-priority sources are hidden under the top one, so they aren't "here".
      if (p.prio < top) break;
      top = p.prio;
      seen.add(p.pid);
      out.push(p);
    }
    return out;
  };

  // History of the selected spot, worked out once per spot (it covers all years).
  let place: { key: string; segs: Segment[] } | null = null;
  const placeAt = (lngLat: [number, number]): Segment[] | null => {
    const key = lngLat.join(',');
    if (place?.key === key) return place.segs;
    const pt = map.project(lngLat);
    const canvas = map.getCanvas();
    if (pt.x < 0 || pt.y < 0 || pt.x > canvas.clientWidth || pt.y > canvas.clientHeight) return null;
    const shapes: PlaceShape[] = allAt(pt).map((f) => {
      const p = f.properties as PolityTileProps;
      const i = typeof f.id === 'number' ? f.id - 1 : -1;
      return { pid: p.pid, name: p.name, from: p.from, to: p.to, prio: p.prio, kind: p.kind, c: p.c, area: i >= 0 ? timeline.f[i * S + 3] : undefined };
    });
    if (!shapes.length) return null;
    place = { key, segs: placeHistory(shapes.filter((s) => s.kind !== 'relation')) };
    return place.segs;
  };

  let renderToken = 0;
  let wantsIdle = false;
  const render = () => {
    const sel = store.selection;
    hm.setSelected(sel?.pid ?? null);
    if (!sel) {
      panel.hidden = true;
      return;
    }
    const entry = polities.get(sel.pid);
    // The feature for the current year, if it is on screen.
    const here = sel.lngLat ? featuresAt(map.project(sel.lngLat)) : [];
    const current =
      here.find((p) => p.pid === sel.pid) ??
      (map.querySourceFeatures('polities', { sourceLayer: 'polities', filter: ['==', ['get', 'pid'], sel.pid] })
        .map((f) => f.properties as PolityTileProps)
        .find((p) => p.from <= store.year && p.to >= store.year));
    const name = current?.name ?? entry?.name ?? sel.pid;
    const color = PALETTE[current?.c ?? 0];
    const source = sources.find((s) => s.id === (current?.src ?? entry?.sources[0]));
    const spans = entry?.spans.map(([a, b]) => formatRange(a, b)) ?? [];
    const kind = current?.kind ?? entry?.kinds[0] ?? 'polity';

    const rows: string[] = [];
    if (current) rows.push(`<dt>This shape</dt><dd>${esc(formatRange(current.from, current.to))}</dd>`);
    if (current?.ov) rows.push(`<dt>Ruled by</dt><dd>${esc(current.ov)}</dd>`);
    if (current?.po) rows.push(`<dt>Part of</dt><dd>${esc(current.po)}</dd>`);
    if (source)
      rows.push(
        `<dt>Source</dt><dd>${
          source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title)}</a>` : esc(source.title)
        } · ${esc(source.license)}</dd>`,
      );

    const others = here.filter((p) => p.pid !== sel.pid);
    const wiki = entry?.wikipedia;
    const series = areaSeries(timeline, byPid.get(sel.pid) ?? []);
    const segs = sel.lngLat ? placeAt(sel.lngLat) : null;
    if (sel.lngLat && !segs && !wantsIdle) {
      // The spot isn't loaded yet (e.g. right after a search jump); try again once the map settles.
      wantsIdle = true;
      map.once('idle', () => {
        wantsIdle = false;
        if (store.selection === sel) render();
      });
    }

    body.innerHTML = `
      <h2><span class="swatch" style="background:${color}"></span>${esc(name)}</h2>
      <div class="years">${spans.length ? `On the map ${esc(spans.slice(0, 4).join(', '))}${spans.length > 4 ? ', …' : ''}` : ''}</div>
      <div class="badges">
        <span class="badge">${esc(KIND_LABEL[kind] ?? kind)}</span>
        ${current ? `<span class="badge ${current.conf}">${esc(CONF_LABEL[current.conf])}</span>` : ''}
      </div>
      ${current?.note ? `<p class="note">${esc(current.note)}</p>` : ''}
      <dl>${rows.join('')}</dl>
      ${
        others.length
          ? `<div class="others"><div class="others-title">Also here in ${esc(formatYear(store.year))}</div>${others
              .map((p) => `<button class="chip" data-pid="${esc(p.pid)}"><span class="swatch" style="background:${PALETTE[p.c]}"></span>${esc(p.name)}</button>`)
              .join('')}</div>`
          : ''
      }
      ${sizeChart(series, store.year, color)}
      ${segs ? placeSection(segs, store.year, sel.pid) : ''}
      ${wiki ? `<div class="wiki" id="wiki">Loading Wikipedia summary…</div>` : ''}`;
    panel.hidden = false;

    body.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) =>
      b.addEventListener('click', () => store.select({ pid: b.dataset.pid!, lngLat: sel.lngLat })),
    );
    // Jump through this place's history: select that holder at the middle of its period.
    body.querySelectorAll<HTMLButtonElement>('.place-item, .band-seg').forEach((b) =>
      b.addEventListener('click', () => {
        store.setYear(Number(b.dataset.year));
        store.select({ pid: b.dataset.pid!, lngLat: sel.lngLat });
      }),
    );
    const chart = body.querySelector<SVGSVGElement>('.size-chart');
    chart?.addEventListener('click', (e) => {
      const r = chart.getBoundingClientRect();
      const first = Number(chart.dataset.first), last = Number(chart.dataset.last);
      const y = Math.round(first + ((e.clientX - r.left) / r.width) * (last - first));
      store.setYear(y === 0 ? 1 : y);
    });
    // Centre the current holder in the list (scrollIntoView would also scroll the panel).
    const list = body.querySelector<HTMLElement>('.place-list');
    const now = list?.querySelector<HTMLElement>('li.now');
    if (list && now) list.scrollTop = now.offsetTop - list.offsetTop - list.clientHeight / 2 + now.clientHeight / 2;

    if (wiki) {
      const token = ++renderToken;
      wikiSummary(wiki).then((s) => {
        const el = document.getElementById('wiki');
        if (!el || token !== renderToken) return;
        const link = s?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, '_'))}`;
        el.innerHTML = `
          ${s?.thumbnail ? `<img src="${esc(s.thumbnail.source)}" alt="">` : ''}
          ${s?.extract ? `<p>${esc(s.extract)}</p>` : ''}
          <a href="${esc(link)}" target="_blank" rel="noopener">Read on Wikipedia →</a>`;
      });
    }
  };
  store.on('selection', render);
  // Keep the panel in sync with the year (shape dates, "also here" list, markers).
  let yearTimer = 0;
  store.on('year', () => {
    if (!store.selection) return;
    clearTimeout(yearTimer);
    yearTimer = window.setTimeout(render, 150);
  });

  map.on('click', (e) => {
    const hit = featuresAt(e.point)[0];
    store.select(hit ? { pid: hit.pid, lngLat: [e.lngLat.lng, e.lngLat.lat] } : null);
  });

  // Hover: tooltip with the name, and a light outline around the shape. Not on touch screens,
  // where a tap would leave the tooltip behind.
  const canHover = window.matchMedia?.('(hover: hover)').matches ?? true;
  let pending = false;
  map.on('mousemove', (e) => {
    if (!canHover) return;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const hit = featuresAt(e.point)[0];
      hm.setHovered(hit?.pid ?? null);
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
      if (!hit) {
        tooltip.hidden = true;
        return;
      }
      tooltip.textContent = hit.name;
      tooltip.style.left = `${e.point.x}px`;
      tooltip.style.top = `${e.point.y}px`;
      tooltip.hidden = false;
    });
  });
  map.getCanvas().addEventListener('mouseleave', () => {
    tooltip.hidden = true;
    hm.setHovered(null);
  });

  return { render };
}
