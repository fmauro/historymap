import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function slug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Download url to dest unless dest already exists. */
export async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

export function unzip(zip: string, outDir: string): void {
  execFileSync('unzip', ['-o', '-q', zip, '-d', outDir]);
}

/** Turn a Wikipedia URL into a page title ("https://en.wikipedia.org/wiki/Jōmon_period" → "Jōmon period"). */
export function wikiTitleFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/wikipedia\.org\/wiki\/([^#?\s]+)/);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return m[1].replace(/_/g, ' ');
  }
}
