// "About" dialog: what the map shows, a legend for its styles, sources and keyboard shortcuts.
import { PALETTE, mix } from './palette';
import { store } from './store';
import { currentTheme } from './theme';
import type { SourceInfo } from './types';

export function initAbout(sources: SourceInfo[]) {
  const dialog = document.getElementById('about') as HTMLDialogElement;
  const button = document.getElementById('about-btn') as HTMLButtonElement;
  const c = PALETTE[3];
  const sourceRows = sources
    .filter((s) => s.features > 0)
    .sort((a, b) => b.priority - a.priority)
    .map((s) => `<li>${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title} <span class="muted">· ${s.license}</span></li>`)
    .join('');

  // Built on open, so the legend matches the current light/dark map colors.
  const render = () => {
    const th = currentTheme();
    const tintOf = (t: number) => mix(th.land, c, t);
    const hatch = `repeating-linear-gradient(135deg, ${th.hatch} 0 1.5px, transparent 1.5px 6px), ${tintOf(th.tints.authored)}`;
    dialog.innerHTML = `
      <form method="dialog"><button class="about-close" aria-label="Close">×</button></form>
      <h2>HistoryMap</h2>
      <p>Who ruled where, and when. Move the slider to see empires, kingdoms, peoples and cultures from the
      Stone Age to today. Click anywhere to see who held that place over time.</p>
      <h3>Legend</h3>
      <ul class="legend">
        <li><span class="lg-swatch" style="background:${tintOf(th.tints.state)};border-color:${th.border}"></span><span><b>State</b> — a kingdom, empire or city-state</span></li>
        <li><span class="lg-swatch" style="background:${tintOf(th.tints.culture)};border-color:${th.borderCulture}"></span><span><i>People or culture</i> — groups without a state, or known from archaeology</span></li>
        <li><span class="lg-swatch" style="background:${hatch};border-style:dashed;border-color:${th.border}"></span><span><b>Hand-drawn</b> — rough extent added by this project where the datasets are blank</span></li>
        <li><span class="lg-swatch" style="background:transparent;border:2.5px solid ${th.selected}"></span><span>Selected polity</span></li>
        <li><span class="lg-swatch" style="background:transparent;border:2px dashed ${th.modern}"></span><span>Today's borders (map button on the right)</span></li>
      </ul>
      <p class="muted">Borders before the modern era are approximations, often drawn from limited evidence.
      Each shape shows its source and how well documented it is.</p>
      <h3>Sources</h3>
      <ul class="sources">${sourceRows}<li>Natural Earth <span class="muted">· public domain</span></li></ul>
      <h3>Keyboard</h3>
      <dl class="keys">
        <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>One year back / forward (<kbd>Shift</kbd> 10, <kbd>Alt</kbd> 100)</dd>
        <dt><kbd>Space</kbd></dt><dd>Play / pause</dd>
        <dt><kbd>/</kbd></dt><dd>Search</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close the info panel</dd>
        <dt><kbd>?</kbd></dt><dd>This help</dd>
      </dl>`;
  };

  const open = () => {
    if (dialog.open) return;
    render();
    dialog.showModal();
  };
  button.addEventListener('click', open);
  // Clicking the backdrop closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('input:not([type=range]), select, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.key === '?') {
      e.preventDefault();
      open();
    } else if (e.key === '/') {
      e.preventDefault();
      (document.getElementById('search-input') as HTMLInputElement).focus();
    } else if (e.key === 'Escape' && !dialog.open && store.selection) {
      store.select(null);
    }
  });
}
