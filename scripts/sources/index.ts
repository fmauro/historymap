import { authored } from './authored';
import { cliopatria } from './cliopatria';
import { historicalBasemaps } from './historical-basemaps';
import { historicalBasemapsCarried } from './historical-basemaps-carried';
import type { SourceAdapter } from './types';

export const ADAPTERS: Record<string, SourceAdapter> = {
  [cliopatria.id]: cliopatria,
  [historicalBasemaps.id]: historicalBasemaps,
  [historicalBasemapsCarried.id]: historicalBasemapsCarried,
  [authored.id]: authored,
};
