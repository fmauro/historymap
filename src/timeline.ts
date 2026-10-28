import { store } from './store';
import { STOPS, tToYear, yearToT } from './timescale';
import { MAX_YEAR, addYears, formatYear, parseYear } from './years';

const SLIDER_MAX = 10000;
const TICKS = [-10000, -3000, -2000, -1000, -500, 1, 500, 1000, 1500, 2000];

function tickLabel(y: number): string {
  if (y === 1) return '1 CE';
  if (y <= -10000) return `${-y / 1000}k BCE`;
  return y < 0 ? `${-y} BCE` : `${y}`;
}

export function initTimeline() {
  const slider = document.getElementById('slider') as HTMLInputElement;
  const input = document.getElementById('year-input') as HTMLInputElement;
  const play = document.getElementById('play') as HTMLButtonElement;
  const speed = document.getElementById('speed') as HTMLSelectElement;
  const ticks = document.getElementById('ticks')!;

  for (const y of TICKS) {
    const s = document.createElement('span');
    s.style.left = `${yearToT(y) * 100}%`;
    s.textContent = tickLabel(y);
    ticks.appendChild(s);
  }

  // Slider position as a float, so playback through coarse (snapped) eras doesn't stall.
  let t = yearToT(store.year);

  const render = () => {
    if (tToYear(t) !== store.year) t = yearToT(store.year);
    slider.value = String(Math.round(t * SLIDER_MAX));
    if (document.activeElement !== input) input.value = formatYear(store.year);
    input.classList.remove('invalid');
  };
  store.on('year', render);
  render();

  slider.addEventListener('input', () => {
    t = Number(slider.value) / SLIDER_MAX;
    store.setYear(tToYear(t));
  });

  const commitInput = () => {
    const y = parseYear(input.value);
    if (y === null) {
      input.classList.add('invalid');
      return;
    }
    store.setYear(y);
    input.value = formatYear(store.year);
    input.blur();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitInput();
    if (e.key === 'Escape') {
      input.value = formatYear(store.year);
      input.blur();
    }
  });
  input.addEventListener('blur', () => {
    input.value = formatYear(store.year);
    input.classList.remove('invalid');
  });
  input.addEventListener('focus', () => input.select());

  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
    b.addEventListener('click', () => store.setYear(addYears(store.year, Number(b.dataset.step)))),
  );

  // Playback: constant speed in years/second within the detailed era, faster through deep time.
  const detailed = STOPS[2];
  const detailedEnd = STOPS[3];
  const yearsPerT = (detailedEnd.year - detailed.year) / (detailedEnd.t - detailed.t);
  let playing = false;
  let last = 0;

  const setPlaying = (on: boolean) => {
    playing = on;
    play.textContent = on ? '❚❚' : '▶';
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) {
      if (store.year >= MAX_YEAR) store.setYear(tToYear(0));
      t = yearToT(store.year);
      last = performance.now();
      requestAnimationFrame(tick);
    }
  };
  const tick = (now: number) => {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t = Math.min(1, t + (Number(speed.value) / yearsPerT) * dt);
    const y = tToYear(t);
    if (y !== store.year) store.setYear(y);
    if (t >= 1) setPlaying(false);
    else requestAnimationFrame(tick);
  };
  play.addEventListener('click', () => setPlaying(!playing));

  // Keyboard: ←/→ step a year (Shift ×10, Alt ×100), space plays/pauses.
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('input:not([type=range]), select, textarea')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const n = e.altKey ? 100 : e.shiftKey ? 10 : 1;
      store.setYear(addYears(store.year, e.key === 'ArrowLeft' ? -n : n));
    } else if (e.key === ' ' && !target.matches('button')) {
      e.preventDefault();
      setPlaying(!playing);
    }
  });

  return { stop: () => setPlaying(false) };
}
