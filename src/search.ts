import Fuse from 'fuse.js';
import type { HistoryMap } from './map';
import { store } from './store';
import type { PolityIndexEntry } from './types';
import { formatRange, formatYear, parseYear } from './years';

const MAX_RESULTS = 12;

export function initSearch(hm: HistoryMap, polities: PolityIndexEntry[], onPick: () => void) {
  const input = document.getElementById('search-input') as HTMLInputElement;
  const list = document.getElementById('search-results') as HTMLUListElement;
  const fuse = new Fuse(polities, { keys: ['name'], threshold: 0.3, ignoreLocation: true });
  // A "go to year" entry is shown first when the query reads as a year ("500 BC", "-500", "1066").
  type Result = PolityIndexEntry | { year: number };
  let results: Result[] = [];
  let active = 0;

  const close = () => {
    list.hidden = true;
    results = [];
  };

  const renderList = () => {
    list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.setAttribute('aria-selected', String(i === active));
      li.innerHTML = `<span class="r-name"></span><span class="r-years"></span>`;
      const name = li.querySelector<HTMLElement>('.r-name')!;
      const years = li.querySelector<HTMLElement>('.r-years')!;
      if ('year' in r) {
        name.textContent = `Go to ${formatYear(r.year)}`;
        li.classList.add('r-goto');
      } else {
        const culture = !r.kinds.includes('polity');
        name.textContent = r.name;
        name.classList.toggle('culture', culture);
        years.textContent = `${culture ? 'people · ' : ''}${formatRange(r.spans[0][0], r.spans[r.spans.length - 1][1])}`;
      }
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(r);
      });
      list.appendChild(li);
    });
    list.hidden = results.length === 0;
  };

  const pick = (r: Result) => {
    onPick();
    if ('year' in r) {
      store.setYear(r.year);
      input.value = '';
      input.blur();
      close();
      return;
    }
    const p = r;
    store.setYear(p.peakYear);
    const [w, s, e, n] = p.peakBbox;
    store.select({ pid: p.id, lngLat: p.peakPoint ?? [(w + e) / 2, (s + n) / 2] });
    hm.map.fitBounds([[w, s], [e, n]], { padding: { top: 90, bottom: 170, left: 390, right: 60 }, maxZoom: 6, duration: 1200 });
    input.value = p.name;
    input.blur();
    close();
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    // Prefer bigger polities when the fuzzy scores tie.
    results = q ? fuse.search(q, { limit: MAX_RESULTS }).map((r) => r.item) : [];
    const year = /^[-+]?[\d,.]+\s*(bce?|ce|ad|b\.c\.|a\.d\.)?$|^(ad|a\.d\.)\s*[\d,]+$/i.test(q) ? parseYear(q) : null;
    if (year !== null) results.unshift({ year });
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
