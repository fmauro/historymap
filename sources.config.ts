// Which data sources go into the map, and how they combine.
//
// - window:   the years a source is used for. Features are cut to this range.
// - priority: higher draws on top. Lower-priority sources only show where higher ones have nothing.
//
// To add a source: write an adapter in scripts/sources/ (see types.ts), register it in
// scripts/sources/index.ts, and add an entry here.
import { MAX_YEAR, MIN_YEAR } from './src/years';

export interface SourceConfig {
  id: string;
  enabled: boolean;
  priority: number;
  window: [number, number];
}

export const SOURCES: SourceConfig[] = [
  // Continuous, curated borders from 3400 BCE.
  { id: 'cliopatria', enabled: true, priority: 30, window: [-3400, MAX_YEAR] },
  // Snapshots reaching back into prehistory; used where Cliopatria has no coverage in time.
  { id: 'historical-basemaps', enabled: true, priority: 20, window: [MIN_YEAR, -3401] },
  // Hand-written approximate shapes, drawn beneath everything else.
  { id: 'authored', enabled: true, priority: 10, window: [MIN_YEAR, MAX_YEAR] },
];
