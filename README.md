# PROMPT STUDIO

Hera.ai-style visual builder for the **Guada & Micha YT** YouTube workflow.
Pick a style → see it live → export Remotion TSX straight into
`../MOTION GRAFIKS/src/` → render to 4K MP4 → drop into DaVinci Resolve.

## Run

```bash
npm install
npm run dev          # → http://localhost:3030
```

`.env.local` already contains your Mapbox token and the absolute path to the
MOTION GRAFIKS folder — no further setup needed.

## What it does

- **Map Studio** (`/studio/map`) — Vox/Johnny Harris style camera animations
  over Mapbox. Pick palette (5 VOX presets seeded from the
  `map-animation-director` skill), set start/mid/end cameras, country ISO,
  labels. Live `@remotion/player` preview at 4K (downscaled).
- **Data Viz Studio** (`/studio/dataviz`) — Animated counters / bar charts /
  line charts with the same palette + typography system.
- **Style Library** (`/styles`) — All 5 + custom palettes.
- **Export** — Writes `Scene{N}-{Name}.tsx` into MOTION GRAFIKS/src/, patches
  `Root.tsx` to add the `<Composition>` entry, optionally fires
  `npx remotion render` to MP4 in `EXPORT/`.

## Architecture

- **One source of truth**: `src/remotion/MapScene.tsx` / `DataVizScene.tsx`
  power the live preview AND get serialized into standalone TSX by
  `src/lib/codegen/`. The exported files import only from `remotion`,
  `react-map-gl`, `mapbox-gl` and the existing `../mapbox.config`.
- **State**: Zustand store in `src/store/studio.ts`, with `SceneSpec` as the
  central data model (see `src/lib/types.ts`).
- **APIs**: `/api/export-tsx` writes the file + patches Root.tsx.
  `/api/render` spawns `npx remotion render` and streams logs (SSE).
