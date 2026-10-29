import type { MultiPolygon, Polygon } from 'geojson';

/** The one format every source adapter produces. The rest of the pipeline only sees this. */
export interface NormalizedFeature {
  /** Groups all time slices of one polity across sources (slug of the name). Used for color + search. */
  polityId: string;
  name: string;
  /** Inclusive years, negative = BCE, never 0. */
  from: number;
  to: number;
  source: string;
  kind: 'polity' | 'relation' | 'culture';
  confidence: 'high' | 'medium' | 'low';
  wikipedia?: string;
  wikidata?: string;
  /** Power exercising authority over this area (colony, vassal). */
  overlord?: string;
  /** Larger grouping it belongs to (cultural area, confederation). */
  partOf?: string;
  /** Free-text note shown in the info panel (e.g. what an approximate shape is based on). */
  note?: string;
  /**
   * Layering within a source: tier 1 is drawn beneath tier 0 and only fills its gaps, and so on.
   * Most sources leave this out.
   */
  tier?: number;
  geometry: Polygon | MultiPolygon;
}

export interface SourceContext {
  /** Directory for this source's downloads (data/raw/<id>). */
  rawDir: string;
  /** Only features overlapping this year range will be kept; adapters may skip work outside it. */
  window: [number, number];
}

export interface SourceAdapter {
  id: string;
  title: string;
  url: string;
  license: string;
  attribution: string;
  /** Download raw data into ctx.rawDir. Must be a no-op when the data is already there. */
  fetch(ctx: SourceContext): Promise<void>;
  normalize(ctx: SourceContext): AsyncIterable<NormalizedFeature>;
}
