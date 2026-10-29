// Shared by the data build (assigns colorIdx) and the map style (turns it into a color).
// Muted, map-friendly fills; the same polity always gets the same color.
export const PALETTE = [
  '#c9a26b', '#a9b97a', '#d98c6c', '#8fb3a6', '#c48aa1', '#e0c171',
  '#9aa6c9', '#b98f6a', '#7fae8a', '#d6a3a3', '#a68cc0', '#c9c27a',
  '#7fa3b8', '#e0a066', '#94b06a', '#b07a7a', '#88b7c7', '#c7a0d0',
  '#a7a37a', '#d4b494', '#7c9c9c', '#cf8f8f', '#9fbf9f', '#b6a1c9',
];

/** FNV-1a hash of the polity id, mapped into the palette. */
export function colorIndex(polityId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < polityId.length; i++) {
    h ^= polityId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % PALETTE.length;
}

/** Blend two #rrggbb colors: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}
