// Time-based summaries for the info panel: who held a place over time, and how a polity's size changed.
import { TIMELINE_STRIDE as S, type TimelineData } from './types';
import { addYears } from './years';

export interface PlaceShape {
  pid: string;
  name: string;
  from: number;
  to: number;
  prio: number;
  kind: string;
  /** Used to break ties: the more specific (smaller) shape wins. */
  area?: number;
  c: number;
}

export interface Segment {
  pid: string;
  name: string;
  from: number;
  to: number;
  kind: string;
  c: number;
}

/**
 * Who is shown at one spot over time, given every shape covering that spot (from any year).
 * At each moment the shape the map would show wins: highest priority, then states over cultures,
 * then the smaller shape. Consecutive periods of the same polity are joined.
 */
export function placeHistory(shapes: PlaceShape[]): Segment[] {
  if (!shapes.length) return [];
  const starts = new Set<number>();
  for (const s of shapes) {
    starts.add(s.from);
    starts.add(addYears(s.to, 1));
  }
  const bounds = [...starts].sort((a, b) => a - b);
  const better = (a: PlaceShape, b: PlaceShape) =>
    a.prio !== b.prio ? a.prio > b.prio : a.kind !== b.kind ? a.kind !== 'culture' : (a.area ?? 0) < (b.area ?? 0);
  const out: Segment[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const from = bounds[i];
    const to = addYears(bounds[i + 1], -1);
    let top: PlaceShape | null = null;
    for (const s of shapes) if (s.from <= from && s.to >= to && (!top || better(s, top))) top = s;
    if (!top) continue;
    const last = out[out.length - 1];
    if (last && last.pid === top.pid && addYears(last.to, 1) === from) last.to = to;
    else out.push({ pid: top.pid, name: top.name, from, to, kind: top.kind, c: top.c });
  }
  return out;
}

/** Index from polity id to the timeline entries of its shapes. */
export function shapesByPid(tl: TimelineData): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (let i = 0; i < tl.f.length / S; i++) {
    const pid = tl.pids[tl.f[i * S + 2]];
    const list = m.get(pid);
    if (list) list.push(i);
    else m.set(pid, [i]);
  }
  return m;
}

/** A polity's area (km²) at evenly spaced years across its lifetime. */
export function areaSeries(tl: TimelineData, shapes: number[], samples = 160): Array<{ year: number; km2: number }> {
  if (!shapes.length) return [];
  let first = Infinity;
  let last = -Infinity;
  for (const i of shapes) {
    first = Math.min(first, tl.f[i * S]);
    last = Math.max(last, tl.f[i * S + 1]);
  }
  const out: Array<{ year: number; km2: number }> = [];
  const n = Math.max(2, Math.min(samples, last - first + 1));
  for (let k = 0; k < n; k++) {
    let year = Math.round(first + ((last - first) * k) / (n - 1));
    if (year === 0) year = 1;
    // Shapes of one polity from different sources can overlap in time; the biggest one is its extent.
    let km2 = 0;
    for (const i of shapes) {
      if (tl.f[i * S] <= year && year <= tl.f[i * S + 1]) km2 = Math.max(km2, tl.f[i * S + 3] * 100);
    }
    out.push({ year, km2 });
  }
  return out;
}
