// Tiny shared state: the current year and the selected polity.
import { clampYear } from './years';

type Listener = () => void;

export interface Selection {
  pid: string;
  /** Click position, used to list other polities at the same spot. */
  lngLat?: [number, number];
}

class Store {
  year = -500;
  selection: Selection | null = null;
  private listeners = new Map<string, Set<Listener>>();

  on(event: 'year' | 'selection', fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  private emit(event: string) {
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  setYear(y: number) {
    const year = clampYear(y);
    if (year === this.year) return;
    this.year = year;
    this.emit('year');
  }

  select(sel: Selection | null) {
    this.selection = sel;
    this.emit('selection');
  }
}

export const store = new Store();
