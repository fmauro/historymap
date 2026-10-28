import area from '@turf/area';
import bbox from '@turf/bbox';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';

export type BBox = [number, number, number, number];

/** Area in km². */
export function areaKm2(g: Polygon | MultiPolygon): number {
  return area(g) / 1e6;
}

export function bounds(g: Polygon | MultiPolygon): BBox {
  return bbox(g) as BBox;
}

/** Best label position: pole of inaccessibility of the largest part. */
export function labelPoint(g: Polygon | MultiPolygon): Position {
  const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = parts[0];
  let bestArea = -1;
  for (const p of parts) {
    const a = area({ type: 'Polygon', coordinates: p });
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  const [minX, minY, maxX, maxY] = bbox({ type: 'Polygon', coordinates: best });
  const precision = Math.max(0.001, Math.min(maxX - minX, maxY - minY) / 100);
  const pt = polylabel(best as [number, number][][], precision);
  return [Math.round(pt[0] * 1e5) / 1e5, Math.round(pt[1] * 1e5) / 1e5];
}

/** Zoom at which a label of this size starts to show. */
export function labelMinZoom(km2: number): number {
  if (km2 > 1_000_000) return 0;
  if (km2 > 250_000) return 2;
  if (km2 > 50_000) return 3;
  if (km2 > 10_000) return 4;
  if (km2 > 2_000) return 5;
  return 6;
}
