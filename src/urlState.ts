// Map view in the URL hash: #y=-500&z=4.2&c=31.2,35.1&sel=roman-empire&g=1&m=1  (g = globe, m = modern borders)
import { clampYear } from './years';

export interface UrlState {
  year?: number;
  zoom?: number;
  center?: [number, number]; // [lng, lat]
  sel?: string;
  globe?: boolean;
  modern?: boolean;
}

export function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const out: UrlState = {};
  const y = Number(params.get('y'));
  if (params.has('y') && Number.isFinite(y) && y !== 0) out.year = clampYear(y);
  const z = Number(params.get('z'));
  if (params.has('z') && Number.isFinite(z)) out.zoom = z;
  const c = params.get('c')?.split(',').map(Number);
  if (c?.length === 2 && c.every(Number.isFinite)) out.center = [c[1], c[0]];
  if (params.get('sel')) out.sel = params.get('sel')!;
  if (params.get('g') === '1') out.globe = true;
  if (params.get('m') === '1') out.modern = true;
  return out;
}

let timer = 0;
export function writeUrl(s: Required<Pick<UrlState, 'year' | 'zoom' | 'center'>> & UrlState) {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const p = new URLSearchParams();
    p.set('y', String(s.year));
    p.set('z', s.zoom.toFixed(2));
    p.set('c', `${s.center[1].toFixed(3)},${s.center[0].toFixed(3)}`);
    if (s.sel) p.set('sel', s.sel);
    if (s.globe) p.set('g', '1');
    if (s.modern) p.set('m', '1');
    history.replaceState(null, '', `#${p.toString().replace(/%2C/g, ',')}`);
  }, 250);
}
