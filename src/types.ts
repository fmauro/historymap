// Shapes of the generated files in public/data/, shared by the build and the app.

/** One entry per polity in polities.json. */
export interface PolityIndexEntry {
  id: string;
  name: string;
  kinds: string[];
  sources: string[];
  wikipedia?: string;
  wikidata?: string;
  /** Merged year ranges during which the polity is on the map. */
  spans: Array<[number, number]>;
  /** Year and bounds of its largest extent. */
  peakYear: number;
  peakBbox: [number, number, number, number];
  maxArea: number;
}

/** One entry per source in sources.json. */
export interface SourceInfo {
  id: string;
  title: string;
  url: string;
  license: string;
  attribution: string;
  window: [number, number];
  features: number;
}

/** Properties on features in the "polities" tile layer. */
export interface PolityTileProps {
  pid: string;
  name: string;
  from: number;
  to: number;
  src: string;
  kind: 'polity' | 'relation' | 'culture';
  conf: 'high' | 'medium' | 'low';
  prio: number;
  c: number;
  ov?: string;
  po?: string;
  note?: string;
}

/** timeline.json: [from, to, pidIndex] for each polity shape; shape id = index + 1. */
export interface TimelineData {
  pids: string[];
  f: number[];
}
