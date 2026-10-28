import { authored } from './authored';
import { cliopatria } from './cliopatria';
import { historicalBasemaps } from './historical-basemaps';
import type { SourceAdapter } from './types';

export const ADAPTERS: Record<string, SourceAdapter> = {
  [cliopatria.id]: cliopatria,
  [historicalBasemaps.id]: historicalBasemaps,
  [authored.id]: authored,
};
