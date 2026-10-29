# HistoryMap

An interactive world map of who ruled where, and when. Drag the time slider from 123,000 BCE to today
and watch empires, kingdoms and cultures rise and fall. The focus is on history before 1000 CE.

- Click a region for its name, years, source, a Wikipedia summary, a chart of its size over time,
  and the **history of that place**: every state or people that held the spot, in order.
- **Moments**: a guided tour of 21 turning points, from the first Americans to the Mongols
  (also marked on the timeline).
- **Largest**: the ten biggest states in the current year, updated as you scrub.
- Search for a polity ("Han dynasty", "Achaemenid") to jump to its largest extent, or type a year ("500 bc").
- Press play (or space) to animate through time. Use ← / → to step one year (Shift: 10, Alt: 100).
- Toggle a globe view and an overlay of today's country borders for orientation.
- Light and dark map themes follow the system setting. Press `?` for the legend and shortcuts.
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
| `npx tsx scripts/tile-stats.ts` | Print the size of a few representative tiles |

## Data sources

Sources are stacked like layers. Each one only shows where the ones above it have nothing at that time:

| Priority | Source | What it adds | License |
|---|---|---|---|
| 1 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank) | States, 3400 BCE – 2024 CE | CC BY 4.0 |
| 2 | [historical-basemaps](https://github.com/aourednik/historical-basemaps) (André Ourednik et al.) | States and peoples in ~50 snapshots, all eras (a few early anachronisms are corrected in `scripts/sources/historical-basemaps-fixes.ts`) | GPL-3.0 |
| 3 | historical-basemaps, carried over | Peoples copied into neighbouring periods where that dataset is blank | GPL-3.0 |
| 4 | `data/authored/` (this project) | ~150 hand-drawn cultures and peoples for the remaining gaps, mostly prehistory | GPL-3.0 |
| – | [Natural Earth](https://www.naturalearthdata.com/) | Land, water, rivers, modern borders | public domain |

Together they cover nearly all inhabited land from about 3000 BCE on (Cliopatria alone covers 15–20%).
Borders before the modern era are approximations, often drawn by researchers from limited evidence.
The info panel shows the source and a confidence badge for every shape; peoples and cultures are drawn paler
than states, with italic labels, and hand-drawn shapes are hatched.

## How it works

**Build time** (`scripts/`): each source has an *adapter* that converts its raw data into one shared
format (`scripts/sources/types.ts`). `scripts/build-data.ts` then:

1. cuts each source to its year window from `sources.config.ts`,
2. merges consecutive time slices whose shape did not change,
3. goes through the sources from highest to lowest priority and checks each shape against what the higher
   sources already cover at that time (`scripts/lib/coverage.ts`, on a 0.5° grid). Shapes that would be
   completely hidden are dropped, and labels move into the part of a shape that stays visible,
4. writes vector tiles with tippecanoe (`polities.pmtiles`, `labels.pmtiles`, `basemap.pmtiles`),
5. writes `polities.json` (search and info index), `timeline.json` (years and size of every shape) and `sources.json`.

**Run time** (`src/`): MapLibre GL draws the tiles straight from the static PMTiles files using
HTTP range requests, so no tile server is needed. Every shape for every year is in the tiles. When the year
changes, `map.ts` uses `timeline.json` to switch individual shapes on or off with MapLibre *feature-state*.
That only updates colors on the GPU, so scrubbing stays smooth. Fills are opaque (pre-blended with the land
color), so a higher-priority source hides whatever lies beneath it. Water is drawn on top of the polities,
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
`confidence` (`low` | `medium`), `wikipedia`, `overlord`, `partOf`, `note` and `tier`.
These shapes are drawn hatched with dashed outlines, beneath the datasets. Because they only show where
nothing else is drawn, outlines can be generous: the parts that overlap better data stay hidden.
`tier: 1` marks a background shape (a broad way of life such as "Mesolithic hunter-gatherers of Europe")
that is drawn beneath the specific cultures of the same era. The build prints any hand-drawn shape that is
never visible.

## Deploying

`npm run build` produces a fully static `dist/` folder. Any static host that supports HTTP range
requests works (GitHub Pages, Netlify, S3, nginx). The polity tile file is about 85 MB, so a host must allow
files that large. Cloudflare Pages, for example, caps files at 25 MB.

Generated data is not committed (`public/data/` is gitignored), so a deploy pipeline needs to run
`npm run build:data` (with tippecanoe installed) before `npm run build`.

## License

Code: GPL-3.0-or-later (see `LICENSE`), chosen to match historical-basemaps.
Cliopatria data is CC BY 4.0. Credit it when sharing the map, as the built-in attribution does.
