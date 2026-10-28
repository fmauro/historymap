# HistoryMap

An interactive world map of who ruled where, and when. Drag the time slider from 123,000 BCE to today
and watch empires, kingdoms and cultures rise and fall. The focus is on history before 1000 CE.

- Click a region for its name, years, source and a Wikipedia summary.
- Search for a polity ("Han dynasty", "Achaemenid") to jump to its largest extent.
- Press play (or space) to animate through time. Use ← / → to step one year (Shift: 10, Alt: 100).
- Toggle a globe view and an overlay of today's country borders for orientation.
- The URL keeps the year, view and selection, so any view can be shared.

## Getting started

Requirements: Node 20+ and [tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe`).

```sh
npm install
npm run build:data   # downloads the datasets and builds public/data/ (a few minutes the first time)
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (year logic, time ranges, merging) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Static production build in `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run build:data -- --no-basemap` | Rebuild polity data only, keep the existing basemap |

## Data sources

| Source | Used for | License |
|---|---|---|
| [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank) | 3400 BCE – 2024 CE | CC BY 4.0 |
| [historical-basemaps](https://github.com/aourednik/historical-basemaps) (André Ourednik et al.) | before 3400 BCE | GPL-3.0 |
| `data/authored/` (this project) | hand-drawn gap filling, marked as approximate | GPL-3.0 |
| [Natural Earth](https://www.naturalearthdata.com/) | land, water, rivers, modern borders | public domain |

Borders before the modern era are approximations, often drawn by researchers from limited evidence.
The info panel shows the source and a confidence badge for every shape.

## How it works

**Build time** (`scripts/`): each source has an *adapter* that converts its raw data into one shared
format (`scripts/sources/types.ts`). `scripts/build-data.ts` then:

1. cuts each source to its year window from `sources.config.ts`,
2. merges consecutive time slices whose shape did not change,
3. writes vector tiles with tippecanoe (`polities.pmtiles`, `labels.pmtiles`, `basemap.pmtiles`),
4. writes `polities.json` (search and info index), `timeline.json` (years of every shape) and `sources.json`.

**Run time** (`src/`): MapLibre GL draws the tiles straight from the static PMTiles files using
HTTP range requests, so no tile server is needed. Every shape for every year is in the tiles. When the year
changes, `map.ts` uses `timeline.json` to switch individual shapes on or off with MapLibre *feature-state*.
That only updates colors on the GPU, so scrubbing stays smooth. Water is drawn on top of the polities,
so rough hand-drawn borders follow real coastlines.

Years are integers: negative is BCE, and there is no year 0. All year logic lives in `src/years.ts`.

## Adding a data source

1. Write an adapter in `scripts/sources/<id>.ts` that implements `SourceAdapter`:
   `fetch()` downloads raw data into `data/raw/<id>/`, and `normalize()` yields `NormalizedFeature`s.
   See `cliopatria.ts` (continuous ranges) or `historical-basemaps.ts` (snapshots).
2. Register it in `scripts/sources/index.ts`.
3. Add an entry to `sources.config.ts` with the years it covers (`window`) and its `priority`.
   Higher priority draws on top; lower-priority sources show through where higher ones have nothing.
4. Run `npm run build:data`.

### Hand-authored data

Files in `data/authored/*.geojson` are checked against a schema on build (`scripts/sources/authored.ts`).
Each feature needs `name`, `from` and `to`; optional fields are `kind` (`culture` | `polity`),
`confidence` (`low` | `medium`), `wikipedia`, `overlord`, `partOf` and `note`.
These shapes are drawn hatched with dashed outlines, beneath the datasets.

## Deploying

`npm run build` produces a fully static `dist/` folder. Any static host that supports HTTP range
requests works (GitHub Pages, Netlify, S3, nginx). The polity tile file is about 56 MB, so a host must allow
files that large. Cloudflare Pages, for example, caps files at 25 MB.

Generated data is not committed (`public/data/` is gitignored), so a deploy pipeline needs to run
`npm run build:data` (with tippecanoe installed) before `npm run build`.

## License

Code: GPL-3.0-or-later (see `LICENSE`), chosen to match historical-basemaps.
Cliopatria data is CC BY 4.0. Credit it when sharing the map, as the built-in attribution does.
