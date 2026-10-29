import { looksLikeCulture } from '../lib/classify';
import { slug } from '../lib/util';
import type { NormalizedFeature } from './types';

// Corrections to historical-basemaps' early snapshots, where a few peoples and states appear thousands
// of years before the evidence for them. Each entry trims a name to the years it is attested, or
// renames it before a given year. Hand-drawn shapes in data/authored/ fill what is removed.

interface Fix {
  /** Earliest year the name is shown. */
  from?: number;
  /** Before this year, show the shape under another name. */
  renameBefore?: { year: number; name: string };
  why: string;
}

export const HB_FIXES: Record<string, Fix> = {
  Bantu: { from: -1500, why: 'The Bantu expansion began around 1500–1000 BCE from Cameroon; earlier maps show it across central Africa.' },
  Austronesians: { from: -2500, why: 'Austronesian speakers spread from Taiwan after about 3000 BCE, reaching Indonesia around 2000–1500 BCE.' },
  'Hurrian Kingdoms': { from: -2500, why: 'Hurrian states are attested from the later 3rd millennium BCE.' },
  'Indus valley civilization': { from: -3300, why: 'The Early Harappan phase begins around 3300 BCE.' },
  Egypt: { from: -3150, why: 'Egypt was unified around 3150 BCE; before that, see Predynastic Egypt.' },
  Elam: { from: -3200, why: 'Elam as a state begins with the Proto-Elamite period, around 3200 BCE.' },
  Ur: { from: -3000, why: 'Ur becomes a major city-state in the Early Dynastic period.' },
  Minoan: { from: -3100, why: 'Minoan civilization begins around 3100 BCE.' },
  Cycladic: { from: -3200, why: 'Cycladic culture begins around 3200 BCE.' },
  Kerma: { from: -2500, why: 'The Kerma culture begins around 2500 BCE.' },
  'Norte Chico': { from: -3500, why: 'The Norte Chico (Caral) sites date from about 3500 BCE.' },
  Valdivia: { from: -3800, why: 'The Valdivia culture dates from about 3800 BCE.' },
  Ainu: { renameBefore: { year: 700, name: 'Jōmon' }, why: 'Ainu culture emerges in the Middle Ages; prehistoric Hokkaido was Jōmon.' },
  'Okhotsk culture': { renameBefore: { year: 500, name: 'Jōmon' }, why: 'The Okhotsk culture dates from about 500 CE.' },
};

/** Apply HB_FIXES to one feature; null when the feature falls entirely before a name's first year. */
export function applyFix(f: NormalizedFeature): NormalizedFeature | null {
  const fix = HB_FIXES[f.name];
  if (!fix) return f;
  if (fix.from !== undefined) {
    if (f.to < fix.from) return null;
    if (f.from < fix.from) f = { ...f, from: fix.from };
  }
  if (fix.renameBefore && f.from < fix.renameBefore.year) {
    const name = fix.renameBefore.name;
    f = { ...f, name, polityId: slug(name), kind: looksLikeCulture(name) ? 'culture' : f.kind, wikipedia: undefined };
  }
  return f;
}
