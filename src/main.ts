import './style.css';
import { initInfoPanel } from './infoPanel';
import { createMap } from './map';
import { initSearch } from './search';
import { store } from './store';
import { initTimeline } from './timeline';
import type { PolityIndexEntry, SourceInfo, TimelineData } from './types';
import { readUrl, writeUrl } from './urlState';

const DATA = `${import.meta.env.BASE_URL}data`;

async function main() {
  const [polities, sources, timelineData] = await Promise.all([
    fetch(`${DATA}/polities.json`).then((r) => r.json() as Promise<PolityIndexEntry[]>),
    fetch(`${DATA}/sources.json`).then((r) => r.json() as Promise<SourceInfo[]>),
    fetch(`${DATA}/timeline.json`).then((r) => r.json() as Promise<TimelineData>),
  ]);
  const byId = new Map(polities.map((p) => [p.id, p]));

  const url = readUrl();
  store.year = url.year ?? -500;

  let syncUrl = () => {};
  const hm = createMap('map', {
    year: store.year,
    center: url.center ?? [30, 32],
    zoom: url.zoom ?? 2.6,
    globe: url.globe ?? false,
    modern: url.modern ?? false,
    timeline: timelineData,
    sources,
    attribution: sources
      .filter((s) => s.features > 0)
      .map((s) => `${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title} (${s.license})`),
    onToggle: () => syncUrl(),
  });

  const timeline = initTimeline();
  initInfoPanel(hm, byId, sources, timelineData);
  initSearch(hm, polities, timeline.stop);

  // Year changes: coalesce to one map update per frame so fast scrubbing stays smooth.
  let frame = 0;
  store.on('year', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      hm.setYear(store.year);
    });
  });

  syncUrl = () => {
    const c = hm.map.getCenter();
    writeUrl({ year: store.year, zoom: hm.map.getZoom(), center: [c.lng, c.lat], sel: store.selection?.pid, globe: hm.isGlobe(), modern: hm.isModern() });
  };
  store.on('year', syncUrl);
  store.on('selection', syncUrl);
  hm.map.on('moveend', syncUrl);

  // Pasting a different link into the same tab only changes the hash.
  window.addEventListener('hashchange', () => {
    const u = readUrl();
    if (u.year !== undefined) store.setYear(u.year);
    if (u.center || u.zoom !== undefined) hm.map.jumpTo({ center: u.center, zoom: u.zoom });
    if (u.sel && u.sel !== store.selection?.pid && byId.has(u.sel)) store.select({ pid: u.sel, lngLat: u.center });
  });

  if (import.meta.env.DEV) Object.assign(window, { hm, store });

  if (url.sel && byId.has(url.sel)) {
    hm.map.once('idle', () => store.select({ pid: url.sel!, lngLat: url.center }));
  }
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:absolute;inset:0;display:grid;place-items:center;font:16px system-ui">Could not load map data. Run <code>npm run build:data</code> first.</div>`,
  );
});
