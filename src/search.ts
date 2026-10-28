import Fuse from 'fuse.js';
import type { HistoryMap } from './map';
import { store } from './store';
import type { PolityIndexEntry } from './types';
import { formatRange } from './years';

const MAX_RESULTS = 12;

export function initSearch(hm: HistoryMap, polities: PolityIndexEntry[], onPick: () => void) {
  const input = document.getElementById('search-input') as HTMLInputElement;
  const list = document.getElementById('search-results') as HTMLUListElement;
  const fuse = new Fuse(polities, { keys: ['name'], threshold: 0.3, ignoreLocation: true });
  let results: PolityIndexEntry[] = [];
  let active = 0;

  const close = () => {
    list.hidden = true;
    results = [];
  };

  const renderList = () => {
    list.innerHTML = '';
    results.forEach((p, i) => {
      const li = document.createElement('li');
      li.setAttribute('aria-selected', String(i === active));
      const first = p.spans[0][0];
      const last = p.spans[p.spans.length - 1][1];
      li.innerHTML = `<span class="r-name"></span><span class="r-years"></span>`;
      li.querySelector('.r-name')!.textContent = p.name;
      li.querySelector('.r-years')!.textContent = formatRange(first, last);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(p);
      });
      list.appendChild(li);
    });
    list.hidden = results.length === 0;
  };

  const pick = (p: PolityIndexEntry) => {
    onPick();
    store.setYear(p.peakYear);
    const [w, s, e, n] = p.peakBbox;
    const center: [number, number] = [(w + e) / 2, (s + n) / 2];
    store.select({ pid: p.id, lngLat: center });
    hm.map.fitBounds([[w, s], [e, n]], { padding: { top: 90, bottom: 170, left: 390, right: 60 }, maxZoom: 6, duration: 1200 });
    input.value = p.name;
    input.blur();
    close();
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    // Prefer bigger polities when the fuzzy scores tie.
    results = q ? fuse.search(q, { limit: MAX_RESULTS }).map((r) => r.item) : [];
    active = 0;
    renderList();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      renderList();
    } else if (e.key === 'Enter' && results[active]) {
      pick(results[active]);
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('focus', () => {
    if (input.value.trim()) input.dispatchEvent(new Event('input'));
  });
}
