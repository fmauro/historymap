import { addYears } from '../../src/years';
import type { PolityIndexEntry } from '../../src/types';
import type { BBox } from './geo';

interface Slice { from: number; to: number; area: number; bbox: BBox; point: [number, number] }

interface Acc {
  name: string;
  sources: Set<string>;
  kinds: Set<string>;
  wikipedia?: string;
  wikidata?: string;
  slices: Slice[];
}

/** Collects every time slice of every polity and produces the search/info index. */
export class SearchIndexBuilder {
  private polities = new Map<string, Acc>();

  add(pid: string, name: string, source: string, kind: string, slice: Slice, wikipedia?: string, wikidata?: string) {
    let acc = this.polities.get(pid);
    if (!acc) {
      acc = { name, sources: new Set(), kinds: new Set(), slices: [] };
      this.polities.set(pid, acc);
    }
    acc.sources.add(source);
    acc.kinds.add(kind);
    acc.wikipedia ??= wikipedia;
    acc.wikidata ??= wikidata;
    acc.slices.push(slice);
  }

  build(): Array<Omit<PolityIndexEntry, 'c'>> {
    const out: Array<Omit<PolityIndexEntry, 'c'>> = [];
    for (const [id, acc] of this.polities) {
      const slices = acc.slices.sort((a, b) => a.from - b.from);
      const spans: Array<[number, number]> = [];
      for (const s of slices) {
        const last = spans[spans.length - 1];
        if (last && s.from <= addYears(last[1], 1)) last[1] = Math.max(last[1], s.to);
        else spans.push([s.from, s.to]);
      }
      // Peak = the slice with the largest area; search jumps there.
      const peak = slices.reduce((a, b) => (b.area > a.area ? b : a));
      const mid = peak.from < 0 && peak.to > 0 ? 1 : Math.round((peak.from + peak.to) / 2) || 1;
      out.push({
        id,
        name: acc.name,
        kinds: [...acc.kinds],
        sources: [...acc.sources],
        wikipedia: acc.wikipedia,
        wikidata: acc.wikidata,
        spans,
        peakYear: mid,
        peakBbox: peak.bbox.map((n) => Math.round(n * 100) / 100) as BBox,
        peakPoint: peak.point.map((n) => Math.round(n * 100) / 100) as [number, number],
        maxArea: Math.round(peak.area),
      });
    }
    return out.sort((a, b) => b.maxArea - a.maxArea);
  }
}
