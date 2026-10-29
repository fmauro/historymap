import type { MultiPolygon, Polygon, Position } from 'geojson';
import { addYears } from '../../src/years';
import { labelPoint } from './geo';
import { Grid } from './raster';

/**
 * Sources are layered: a lower-priority source only shows where higher-priority sources have
 * nothing at that time (the map draws fills opaque, so the top one hides the rest).
 * This class answers, for each lower-priority shape, which part of it is still visible over time,
 * so the build can drop shapes that are hidden anyway and put labels where they can be seen.
 *
 * It works on a coarse grid (0.5°), which is plenty for label placement and duplicate detection.
 */

export interface Shape {
  from: number;
  to: number;
  geometry: Polygon | MultiPolygon;
}

export interface LabelSpan {
  from: number;
  to: number;
  point: Position;
  /** Visible area in km², drives label size and min zoom. */
  km2: number;
  /** Nothing covers the shape during this span, so every part of it can be labelled. */
  full: boolean;
}

export interface Analysis {
  /** The shape is (almost) entirely hidden under higher-priority shapes for its whole life. */
  hidden: boolean;
  /** Average share of the shape that is not covered by higher-priority shapes (0..1). */
  visibleShare: number;
  labels: LabelSpan[];
}

/** How often (in years) visibility is re-checked within a long-lived shape. */
const STEP = 25;
/** Hidden if at least this share is covered at every sample... */
const HIDDEN_SHARE = 0.75;
/** ...or if at least half is covered and the visible rest is this small (km²). */
const HIDDEN_REST_KM2 = 50_000;
/** Labels need this many cells (~55 km each) of clearance from covered ground, unless mostly visible. */
const MIN_CLEARANCE = 2;

interface Cover { from: number; to: number; cells: Int32Array }

interface Sample {
  covered: number; // share of cells covered
  freeKm2: number;
  point: Position | null; // null: no label
}

export class Coverage {
  private grid = new Grid(0.5);
  private covers: Cover[] = [];
  private mask: Uint8Array;

  constructor() {
    this.mask = new Uint8Array(this.grid.w * this.grid.h);
  }

  /** Cells of a shape; tiny shapes get at least the cell under their label point. */
  private cellsOf(g: Polygon | MultiPolygon, fallback: () => Position): Int32Array {
    const cells: number[] = [];
    this.grid.rasterize(g, (c) => cells.push(c));
    if (!cells.length) {
      const [lng, lat] = fallback();
      cells.push(this.grid.cellOf(lng, lat));
    }
    return Int32Array.from(cells);
  }

  /** Register shapes from a higher-priority source. */
  add(shape: Shape) {
    this.covers.push({ from: shape.from, to: shape.to, cells: this.cellsOf(shape.geometry, () => labelPoint(shape.geometry)) });
  }

  analyze(shapes: Shape[]): Analysis[] {
    const g = this.grid;
    const n = shapes.length;
    const points: Position[] = new Array(n);
    const pointOf = (i: number) => (points[i] ??= labelPoint(shapes[i].geometry));
    const cells = shapes.map((s, i) => this.cellsOf(s.geometry, () => pointOf(i)));
    const totalKm2 = cells.map((cs) => cs.reduce((a, c) => a + g.cellKm2(c), 0));

    // Sample years per shape: its start, then every STEP years. Shapes that no cover overlaps in time
    // need no analysis.
    const minCover = this.covers.reduce((m, c) => Math.min(m, c.from), Infinity);
    const maxCover = this.covers.reduce((m, c) => Math.max(m, c.to), -Infinity);
    const samples: number[][] = shapes.map((s) => {
      if (s.to < minCover || s.from > maxCover) return [];
      const ys = [s.from];
      for (let y = Math.ceil((s.from + 1) / STEP) * STEP; y <= s.to; y += STEP) if (y !== 0) ys.push(y);
      return ys;
    });
    const results: Sample[][] = shapes.map(() => []);

    const byYear = new Map<number, number[]>();
    samples.forEach((ys, i) => ys.forEach((y) => (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(i)));
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const lastPoint: Array<Position | null> = new Array(n).fill(null);

    for (const year of years) {
      const set: number[] = [];
      for (const c of this.covers) {
        if (c.from > year || c.to < year) continue;
        for (const cell of c.cells) {
          if (!this.mask[cell]) {
            this.mask[cell] = 1;
            set.push(cell);
          }
        }
      }
      for (const i of byYear.get(year)!) {
        const cs = cells[i];
        let coveredCount = 0;
        let freeKm2 = 0;
        for (const c of cs) {
          if (this.mask[c]) coveredCount++;
          else freeKm2 += g.cellKm2(c);
        }
        const covered = coveredCount / cs.length;
        let point: Position | null = null;
        if (coveredCount === 0) point = pointOf(i);
        else if (coveredCount < cs.length) point = this.placeLabel(cs, [pointOf(i), lastPoint[i]], covered < 0.5);
        lastPoint[i] = point;
        results[i].push({ covered, freeKm2, point });
      }
      for (const c of set) this.mask[c] = 0;
    }

    return shapes.map((s, i) => {
      const rs = results[i];
      if (!rs.length) return { hidden: false, visibleShare: 1, labels: [{ from: s.from, to: s.to, point: pointOf(i), km2: totalKm2[i], full: true }] };
      const hidden = rs.every((r) => r.covered >= HIDDEN_SHARE || (r.covered >= 0.5 && r.freeKm2 < HIDDEN_REST_KM2));
      const labels: LabelSpan[] = [];
      rs.forEach((r, k) => {
        if (!r.point) return;
        const from = samples[i][k];
        const to = k + 1 < rs.length ? addYears(samples[i][k + 1], -1) : s.to;
        const prev = labels[labels.length - 1];
        const full = r.covered === 0;
        if (prev && prev.point === r.point && prev.full === full && addYears(prev.to, 1) === from) {
          prev.to = to;
          prev.km2 = Math.max(prev.km2, r.freeKm2);
        } else labels.push({ from, to, point: r.point, km2: r.freeKm2, full });
      });
      const visibleShare = rs.reduce((a, r) => a + 1 - r.covered, 0) / rs.length;
      return { hidden, visibleShare, labels };
    });
  }

  /**
   * Distance (in cells, 8-neighbour) from each cell of a shape to the nearest cell that is outside it
   * or blocked, over the shape's bounding box plus a one-cell margin.
   */
  private distanceField(cells: Int32Array, blocked: (cell: number) => boolean) {
    const g = this.grid;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cells) {
      const x = c % g.w, y = (c / g.w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const lw = x1 - x0 + 3, lh = y1 - y0 + 3;
    const dist = new Int32Array(lw * lh); // 0 = blocked or outside
    const INF = 1 << 30;
    for (const c of cells) if (!blocked(c)) dist[(((c / g.w) | 0) - y0 + 1) * lw + (c % g.w) - x0 + 1] = INF;
    const queue: number[] = [];
    for (let k = 0; k < dist.length; k++) if (dist[k] === 0) queue.push(k);
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q];
      const kx = k % lw, ky = (k / lw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx, ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= lw || ny >= lh) continue;
          const nk = ny * lw + nx;
          if (dist[nk] === INF) {
            dist[nk] = dist[k] + 1;
            queue.push(nk);
          }
        }
      }
    }
    const local = (p: Position) => {
      const c = g.cellOf(p[0], p[1]);
      const lx = (c % g.w) - x0 + 1, ly = ((c / g.w) | 0) - y0 + 1;
      return lx < 0 || ly < 0 || lx >= lw || ly >= lh ? -1 : ly * lw + lx;
    };
    const center = (k: number): Position => {
      const bx = (k % lw) + x0 - 1, by = ((k / lw) | 0) + y0 - 1;
      return [Math.round((-180 + (bx + 0.5) * g.res) * 1e3) / 1e3, Math.round((90 - (by + 0.5) * g.res) * 1e3) / 1e3];
    };
    return { dist, lw, local, center };
  }

  /**
   * Where to label the uncovered part of a shape (this.mask holds the covered cells).
   * Picks the free cell farthest from covered or outside ground, but keeps a preferred point
   * (the usual label spot, or last sample's) when it is still well inside the free part, so labels
   * don't jump around between samples.
   */
  private placeLabel(cells: Int32Array, preferred: Array<Position | null>, mostlyFree: boolean): Position | null {
    const { dist, local, center } = this.distanceField(cells, (c) => this.mask[c] === 1);
    let best = -1, bestD = 0;
    for (let k = 0; k < dist.length; k++) {
      if (dist[k] > bestD) {
        bestD = dist[k];
        best = k;
      }
    }
    if (best < 0 || (bestD < MIN_CLEARANCE && !mostlyFree)) return null;
    for (const p of preferred) {
      if (!p) continue;
      const k = local(p);
      if (k >= 0 && dist[k] >= Math.max(1, bestD * 0.6)) return p;
    }
    return center(best);
  }

  /**
   * Extra label spots for a big shape, far away from its main label: one per region that is wide
   * in its own right (an empire stretching from the Balkans to Egypt gets one in Anatolia too).
   */
  spreadLabels(g: Polygon | MultiPolygon, main: Position, max = 3): Array<{ point: Position; km2: number }> {
    const cells = this.cellsOf(g, () => main);
    if (cells.length < 60) return [];
    const { dist, lw, local, center } = this.distanceField(cells, () => false);
    const picked: Array<{ k: number; d: number }> = [];
    const mk = local(main);
    let top = 0;
    for (let k = 0; k < dist.length; k++) top = Math.max(top, dist[k]);
    if (mk >= 0) picked.push({ k: mk, d: Math.max(dist[mk], top) });
    const far = (k: number, d: number) =>
      picked.every((p) => {
        const dx = (k % lw) - (p.k % lw), dy = ((k / lw) | 0) - ((p.k / lw) | 0);
        return Math.hypot(dx, dy) > Math.max(10, 2.5 * Math.max(d, p.d));
      });
    const order = [...dist.keys()].filter((k) => dist[k] >= 3).sort((a, b) => dist[b] - dist[a]);
    const out: Array<{ point: Position; km2: number }> = [];
    for (const k of order) {
      if (out.length >= max) break;
      const d = dist[k];
      if (d < Math.max(3, top * 0.45)) break;
      if (!far(k, d)) continue;
      picked.push({ k, d });
      const side = d * this.grid.res * 111;
      out.push({ point: center(k), km2: Math.round(side * side * 3) });
    }
    return out;
  }
}
