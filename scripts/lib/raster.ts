import type { MultiPolygon, Polygon } from 'geojson';

/**
 * A coarse equirectangular grid over the world, used for quick coverage questions
 * ("is this point or area already covered by another source at this time?") without
 * doing exact polygon geometry.
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  constructor(readonly res = 0.5) {
    this.w = Math.round(360 / res);
    this.h = Math.round(180 / res);
  }

  cellOf(lng: number, lat: number): number {
    const x = Math.min(this.w - 1, Math.max(0, Math.floor((lng + 180) / this.res)));
    const y = Math.min(this.h - 1, Math.max(0, Math.floor((90 - lat) / this.res)));
    return y * this.w + x;
  }

  /** Cell indices whose centers lie inside the polygon (even-odd rule over all rings). */
  rasterize(g: Polygon | MultiPolygon, visit: (cell: number) => void) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polys) {
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const p of rings[0]) {
        if (p[1] < minLat) minLat = p[1];
        if (p[1] > maxLat) maxLat = p[1];
      }
      const y0 = Math.max(0, Math.floor((90 - maxLat) / this.res));
      const y1 = Math.min(this.h - 1, Math.floor((90 - minLat) / this.res));
      const xs: number[] = [];
      for (let y = y0; y <= y1; y++) {
        const lat = 90 - (y + 0.5) * this.res;
        xs.length = 0;
        for (const ring of rings) {
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [ax, ay] = ring[j];
            const [bx, by] = ring[i];
            if (ay > lat !== by > lat) xs.push(ax + ((lat - ay) / (by - ay)) * (bx - ax));
          }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xa = Math.ceil((xs[k] + 180) / this.res - 0.5);
          const xb = Math.floor((xs[k + 1] + 180) / this.res - 0.5);
          for (let x = Math.max(0, xa); x <= Math.min(this.w - 1, xb); x++) visit(y * this.w + x);
        }
      }
    }
  }

  /** Approximate area of a cell in km² (cells shrink towards the poles). */
  cellKm2(cell: number): number {
    const y = Math.floor(cell / this.w);
    const lat = 90 - (y + 0.5) * this.res;
    const side = 111.32 * this.res;
    return side * side * Math.cos((lat * Math.PI) / 180);
  }
}
