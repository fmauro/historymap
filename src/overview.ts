// "Largest states" popover: the biggest states in the current year, updated as the year changes.
import { ToggleControl, type HistoryMap } from './map';
import { PALETTE, colorIndex } from './palette';
import { store } from './store';
import { TIMELINE_STRIDE as S, type PolityIndexEntry, type TimelineData } from './types';
import { formatYear } from './years';

const COUNT = 10;
const ICON = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="1" y="2" width="14" height="2.4" rx="1"/><rect x="1" y="6.8" width="10" height="2.4" rx="1"/><rect x="1" y="11.6" width="6" height="2.4" rx="1"/></svg>`;

export function initOverview(hm: HistoryMap, polities: Map<string, PolityIndexEntry>, tl: TimelineData, stopPlayback: () => void) {
  const box = document.getElementById('overview')!;
  const n = tl.f.length / S;
  // Only states: peoples and cultures are not "powers", and their areas are very rough.
  const isState = tl.pids.map((pid) => polities.get(pid)?.kinds.includes('polity') ?? false);

  const top = (year: number) => {
    const best = new Map<number, number>(); // pid index -> km²
    for (let i = 0; i < n; i++) {
      if (tl.f[i * S] > year || tl.f[i * S + 1] < year) continue;
      const p = tl.f[i * S + 2];
      if (!isState[p]) continue;
      const km2 = tl.f[i * S + 3] * 100;
      if (km2 > (best.get(p) ?? 0)) best.set(p, km2);
    }
    return [...best].sort((a, b) => b[1] - a[1]).slice(0, COUNT);
  };

  const render = () => {
    if (box.hidden) return;
    const rows = top(store.year);
    const max = rows[0]?.[1] ?? 1;
    box.innerHTML = `
      <div class="ov-title">Largest states in ${formatYear(store.year)}</div>
      ${rows.length ? '' : '<p class="muted">No states on the map yet: only peoples and cultures.</p>'}
      <ol class="ov-list">${rows
        .map(([p, km2]) => {
          const pid = tl.pids[p];
          const name = polities.get(pid)?.name ?? pid;
          const color = PALETTE[polities.get(pid)?.c ?? colorIndex(pid)];
          return `<li><button class="ov-item" data-pid="${pid}">
            <span class="ov-name">${name.replace(/</g, '&lt;')}</span>
            <span class="ov-area">${km2 >= 1e6 ? `${(km2 / 1e6).toFixed(1)}M` : `${Math.round(km2 / 1e3)}k`} km²</span>
            <span class="ov-bar"><span style="width:${(100 * km2) / max}%;background:${color}"></span></span>
          </button></li>`;
        })
        .join('')}</ol>`;
    box.querySelectorAll<HTMLButtonElement>('.ov-item').forEach((b) =>
      b.addEventListener('click', () => {
        const entry = polities.get(b.dataset.pid!);
        if (!entry) return;
        stopPlayback();
        const [w, s, e, nn] = entry.peakBbox;
        store.select({ pid: entry.id, lngLat: entry.peakPoint ?? [(w + e) / 2, (s + nn) / 2] });
        hm.map.fitBounds([[w, s], [e, nn]], { padding: 80, maxZoom: 5, duration: 1000 });
      }),
    );
  };

  hm.map.addControl(
    new ToggleControl(ICON, 'Largest states this year', () => !box.hidden, (on) => {
      box.hidden = !on;
      render();
    }),
    'top-right',
  );
  // Throttled: scrubbing fires many year changes.
  let timer = 0;
  store.on('year', () => {
    if (box.hidden || timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      render();
    }, 120);
  });
}
