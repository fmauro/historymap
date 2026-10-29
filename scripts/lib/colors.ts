import type { MultiPolygon, Polygon } from 'geojson';
import { PALETTE, colorIndex } from '../../src/palette';
import { Grid } from './raster';

/** How alike two palette colors look, 1 (same) to 0 (clearly different), from a weighted RGB distance. */
const SIMILARITY: number[][] = (() => {
  const rgb = PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  return rgb.map((a) =>
    rgb.map((b) => {
      const r = (a[0] + b[0]) / 2;
      const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const d = Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
      return Math.max(0, 1 - d / 150);
    }),
  );
})();

/**
 * Picks a palette color per polity so that polities that border each other (at the same time)
 * get different colors. A polity keeps one color for its whole history.
 *
 * Neighbours are found on a coarse grid: at sample years, every cell gets the polity drawn on top,
 * and two different polities in adjacent cells are neighbours (weighted by how long the shared
 * border is). Overlapping polities count as neighbours too. Colors are then assigned greedily,
 * most-connected polities first: each takes the palette color that looks least like its neighbours'
 * colors, preferring its usual hashed color on ties.
 */
export class ColorPlanner {
  private grid = new Grid(0.5);
  private pids: string[] = [];
  private pidIndex = new Map<string, number>();
  private shapes: Array<{ p: number; from: number; to: number; prio: number; cells: Int32Array }> = [];

  add(pid: string, from: number, to: number, prio: number, geometry: Polygon | MultiPolygon) {
    let p = this.pidIndex.get(pid);
    if (p === undefined) {
      p = this.pids.length;
      this.pids.push(pid);
      this.pidIndex.set(pid, p);
    }
    const cells: number[] = [];
    this.grid.rasterize(geometry, (c) => cells.push(c));
    if (cells.length) this.shapes.push({ p, from, to, prio, cells: Int32Array.from(cells) });
  }

  /** Sample years: dense in the historical era, sparse in prehistory. */
  private years(): number[] {
    const ys: number[] = [];
    for (let y = -10000; y < -3500; y += 250) ys.push(y);
    for (let y = -3500; y <= 2020; y += 10) ys.push(y === 0 ? 1 : y);
    return ys;
  }

  /** Colors per polity, plus how alike neighbours look on average (0..1) before and after. */
  assign(): { colors: Map<string, number>; clashBefore: number; clashAfter: number } {
    const { w, h } = this.grid;
    const top = new Int32Array(w * h);
    const topPrio = new Float64Array(w * h);
    const edges = new Map<number, number>(); // a * n + b (a < b) -> weight
    const n = this.pids.length;
    const byFrom = [...this.shapes].sort((a, b) => a.from - b.from);

    for (const year of this.years()) {
      top.fill(-1);
      topPrio.fill(-Infinity);
      const painted: number[] = [];
      for (const s of byFrom) {
        if (s.from > year) break;
        if (s.to < year) continue;
        for (const c of s.cells) {
          if (s.prio > topPrio[c]) {
            if (top[c] === -1) painted.push(c);
            top[c] = s.p;
            topPrio[c] = s.prio;
          } else if (s.prio === topPrio[c] && top[c] !== s.p) {
            // Overlap within one source: which one is drawn on top is arbitrary, so keep them apart.
            const a = top[c], b = s.p;
            const key = a < b ? a * n + b : b * n + a;
            edges.set(key, (edges.get(key) ?? 0) + 1);
          }
        }
      }
      for (const c of painted) {
        const a = top[c];
        const x = c % w;
        for (const nb of [x + 1 < w ? c + 1 : -1, c + w < w * h ? c + w : -1]) {
          if (nb < 0) continue;
          const b = top[nb];
          if (b === -1 || b === a) continue;
          const key = a < b ? a * n + b : b * n + a;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
    }

    const neighbours: Array<Array<[number, number]>> = this.pids.map(() => []);
    const degree = new Float64Array(n);
    for (const [key, wgt] of edges) {
      const a = Math.floor(key / n), b = key % n;
      neighbours[a].push([b, wgt]);
      neighbours[b].push([a, wgt]);
      degree[a] += wgt;
      degree[b] += wgt;
    }

    const color = new Int32Array(n).fill(-1);
    const order = [...Array(n).keys()].sort((a, b) => degree[b] - degree[a]);
    const k = PALETTE.length;
    for (const p of order) {
      const cost = new Float64Array(k);
      for (const [q, wgt] of neighbours[p]) {
        if (color[q] < 0) continue;
        for (let c = 0; c < k; c++) cost[c] += wgt * SIMILARITY[c][color[q]];
      }
      let best = colorIndex(this.pids[p]);
      for (let c = 0; c < k; c++) if (cost[c] < cost[best] - 1e-9) best = c;
      color[p] = best;
    }
    // Shared border between look-alike neighbours, before (hashed colors) and after.
    let clashBefore = 0, clashAfter = 0, total = 0;
    for (const [key, wgt] of edges) {
      const a = Math.floor(key / n), b = key % n;
      total += wgt;
      clashBefore += wgt * SIMILARITY[colorIndex(this.pids[a])][colorIndex(this.pids[b])];
      clashAfter += wgt * SIMILARITY[color[a]][color[b]];
    }
    return {
      colors: new Map(this.pids.map((pid, i) => [pid, color[i]])),
      clashBefore: clashBefore / Math.max(1, total),
      clashAfter: clashAfter / Math.max(1, total),
    };
  }
}
