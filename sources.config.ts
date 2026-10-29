// Which data sources go into the map, and how they combine.
//
// - window:   the years a source is used for. Features are cut to this range.
// - priority: higher draws on top. Lower-priority sources only show where higher ones have nothing
//             at that time; shapes that would be hidden entirely are dropped at build time.
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
  // Snapshots reaching back into prehistory. After 3400 BCE it fills the places Cliopatria leaves
  // empty (peoples, cultures, the Americas, Africa, Australia, Siberia).
  { id: 'historical-basemaps', enabled: true, priority: 20, window: [MIN_YEAR, MAX_YEAR] },
  // Peoples from neighbouring historical-basemaps snapshots, for periods where that dataset is blank.
  { id: 'historical-basemaps-carried', enabled: true, priority: 15, window: [MIN_YEAR, MAX_YEAR] },
  // Hand-written approximate shapes, drawn beneath everything else.
  { id: 'authored', enabled: true, priority: 10, window: [MIN_YEAR, MAX_YEAR] },
];
