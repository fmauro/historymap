// Share button in the map controls: the URL already holds the year, view and selection.
import type { IControl } from 'maplibre-gl';

const ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 11.5l3-3"/><path d="M10.5 5.5l1.3-1.3a3 3 0 014.2 4.2L14.5 9.7"/><path d="M9.5 14.5l-1.3 1.3a3 3 0 01-4.2-4.2l1.3-1.3"/></svg>`;

export class ShareControl implements IControl {
  private el!: HTMLDivElement;

  onAdd() {
    this.el = document.createElement('div');
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle-btn';
    b.title = 'Share this view';
    b.setAttribute('aria-label', 'Share this view');
    b.innerHTML = ICON;
    b.addEventListener('click', () => this.share());
    this.el.appendChild(b);
    return this.el;
  }

  onRemove() {
    this.el.remove();
  }

  private async share() {
    const url = window.location.href;
    // Tablets and phones: the system share sheet. Elsewhere: copy to the clipboard.
    if (navigator.share && window.matchMedia?.('(hover: none)').matches) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch {
        // Cancelled or unavailable: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Copy the link from the address bar');
    }
  }
}

let timer = 0;
function toast(text: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el!.classList.remove('show'), 1800);
}
