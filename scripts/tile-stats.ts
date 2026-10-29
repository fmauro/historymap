// Prints the size of a few representative tiles, to keep an eye on download size.
//   npx tsx scripts/tile-stats.ts public/data/polities.pmtiles
import { openSync, readSync } from 'node:fs';
import { PMTiles, type Source } from 'pmtiles';

const file = process.argv[2] ?? 'public/data/polities.pmtiles';
const fd = openSync(file, 'r');
const source: Source = {
  getKey: () => file,
  getBytes: async (offset, length) => {
    const b = Buffer.alloc(length);
    readSync(fd, b, 0, length, offset);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + length) as ArrayBuffer };
  },
};
const pm = new PMTiles(source);
// World, Europe/Mediterranean at a few zooms.
const tiles: Array<[number, number, number]> = [[0, 0, 0], [1, 1, 0], [2, 2, 1], [3, 4, 2], [4, 8, 5], [5, 17, 11], [6, 34, 23]];
for (const [z, x, y] of tiles) {
  const t = await pm.getZxy(z, x, y);
  console.log(`${z}/${x}/${y}  ${t ? `${(t.data.byteLength / 1e6).toFixed(2)} MB` : '-'}`);
}
