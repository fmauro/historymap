import type { MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import type { HistoryMap } from './map';
import { polityLayerIds } from './map';
import { PALETTE } from './palette';
import { store } from './store';
import type { PolityIndexEntry, PolityTileProps, SourceInfo } from './types';
import { formatRange } from './years';

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

export function initInfoPanel(hm: HistoryMap, polities: Map<string, PolityIndexEntry>, sources: SourceInfo[]) {
  const { map } = hm;
  const panel = document.getElementById('info')!;
  const body = document.getElementById('info-body')!;
  const tooltip = document.getElementById('tooltip')!;
  document.getElementById('info-close')!.addEventListener('click', () => store.select(null));

  const featuresAt = (point: PointLike): PolityTileProps[] => {
    const seen = new Set<string>();
    const out: PolityTileProps[] = [];
    // Topmost first: higher-priority sources are drawn on top.
    const feats = map.queryRenderedFeatures(point, { layers: polityLayerIds }) as MapGeoJSONFeature[];
    let top = -Infinity;
    for (const f of feats.sort((a, b) => (b.properties.prio as number) - (a.properties.prio as number))) {
      const p = f.properties as PolityTileProps;
      // Shapes from other years are still on the map, just invisible.
      if (p.from > store.year || p.to < store.year || seen.has(p.pid)) continue;
      // Lower-priority sources are hidden under the top one, so they aren't "here".
      if (p.prio < top) break;
      top = p.prio;
      seen.add(p.pid);
      out.push(p);
    }
    return out;
  };

  let renderToken = 0;
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

    body.innerHTML = `
      <h2><span class="swatch" style="background:${color}"></span>${esc(name)}</h2>
      <div class="years">${spans.length ? `On the map ${esc(spans.slice(0, 4).join(', '))}${spans.length > 4 ? ', …' : ''}` : ''}</div>
      <div class="badges">
        <span class="badge">${esc(KIND_LABEL[kind] ?? kind)}</span>
        ${current ? `<span class="badge ${current.conf}">${esc(CONF_LABEL[current.conf])}</span>` : ''}
      </div>
      ${current?.note ? `<p class="note">${esc(current.note)}</p>` : ''}
      <dl>${rows.join('')}</dl>
      ${wiki ? `<div class="wiki" id="wiki">Loading Wikipedia summary…</div>` : ''}
      ${
        others.length
          ? `<div class="others"><div class="others-title">Also here in ${esc(formatRange(store.year, store.year))}</div>${others
              .map((p) => `<button class="chip" data-pid="${esc(p.pid)}"><span class="swatch" style="background:${PALETTE[p.c]}"></span>${esc(p.name)}</button>`)
              .join('')}</div>`
          : ''
      }`;
    panel.hidden = false;
    body.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) =>
      b.addEventListener('click', () => store.select({ pid: b.dataset.pid!, lngLat: sel.lngLat })),
    );

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
  // Keep the panel in sync with the year (shape dates, "also here" list).
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

  // Hover tooltip with the polity name.
  let pending = false;
  map.on('mousemove', (e) => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const hit = featuresAt(e.point)[0];
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
  map.getCanvas().addEventListener('mouseleave', () => (tooltip.hidden = true));

  return { render };
}
