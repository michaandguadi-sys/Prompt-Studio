# PROMPT STUDIO — How to use it

Visual builder for the YouTube → DaVinci Resolve 4K workflow.
Pick a style → see it live → write the TSX into MOTION GRAFIKS → render → cut.

---

## 0. One-time setup

```bash
cd "/Users/micharoessler/Desktop/Projekte/Guada & Micha YT/PROMPT STUDIO"
npm install                 # ~30s
npm run dev                 # → http://localhost:3030
```

Mapbox token is already in `.env.local`. Open the URL in your browser and bookmark it.

---

## 1. Map animation (the Vox/Johnny Harris flow)

**Use for:** continent → country → city zoom-ins, route reveals, conflict maps, "where is this place" intros.

1. Click **Map** in the left rail.
2. **Search location.** Type "Istanbul" → click the city result → it fills the **end** camera at zoom 9.5.
   - Toggle the **start / mid / end** chip above the search to fill different camera waypoints.
   - For a country opener, search "Türkiye" → apply to `end` → it also auto-sets `countryISO: TR` so the border highlight works.
3. **Pick a palette.** 5 presets ready (Warm Amber, Cold, Conflict, Trade, Political) — or pick custom colors with the hex pickers.
4. **Labels.** Two labels by default: a city label that tracks the projected dot, and a bottom-banner label. Edit primary/secondary text + in/out frames.
5. **Style tweaks.** Title size, letter spacing, vignette opacity, letterbox bars — all live-updating in the center preview.
6. (Optional) **Save preset.** Type a name in the top bar → **Save**. Re-load on any future scene.
7. **Export to MOTION GRAFIKS** (bottom-left button).
   - Filename = scene name field (e.g. `Scene03-Istanbul`).
   - If you tick "Also render 4K MP4" it spawns `npx remotion render` and streams logs.

---

## 2. Data viz (counters, bars, line charts)

**Use for:** stat reveals ("1.4M people"), top-N comparisons, growth-over-time charts.

1. Click **Data** in the left rail.
2. **Variant** — Counter / Bar / Line.
   - **Counter:** value, prefix, suffix (e.g. `prefix=""`, `value=1400000`, `suffix=" PEOPLE"` → `1,400,000 PEOPLE` with a spring counter-up).
   - **Bar:** add data points (label + value). Heights normalize automatically.
   - **Line:** add timeline points. Path reveals progressively with a glow drop shadow.
3. **Title + subtitle** (top of frame). Same palette + typography as your map scenes for visual consistency.
4. **Reveal timing.** In / hold / out frames control fade and the spring counter.
5. Export same as map.

---

## 3. Title card

**Use for:** episode opens, chapter cards, location intros, end cards.

1. Click **Title** in the left rail.
2. **Variant** — Centered / Left-aligned / Centered + rule.
3. **Background** — Solid dark, or palette gradient (radial bloom).
4. **Copy.** Kicker (small top), Title (huge), Subtitle (smaller, dim).
5. Reveal timing. Export.

---

## 4. Lower third (talking-head name plate)

**Use for:** introducing speakers, location stamps over b-roll.

1. Click **L3rd** in the left rail.
2. **Position** — bottom-left or bottom-right. Slides in from the edge.
3. **Accent bar** on/off (thin amber vertical bar that grows in).
4. **Name** (large white) + **Role** (small accent color).
5. Export.

> **Critical:** Lower thirds render on a **transparent background**. In MOTION GRAFIKS your render command is the same, but in DaVinci Resolve:
> - Use a render preset with alpha channel (ProRes 4444, PNG sequence, or DNxHR with alpha).
> - OR add a key — chroma key on `#06080f` works since the title cards use that color and lower thirds use transparent.

---

## 5. The export → render → DaVinci loop

```
[Studio] Click "Export to MOTION GRAFIKS"
   ↓
[Disk] MOTION GRAFIKS/src/Scene{N}-{Name}.tsx is written
       MOTION GRAFIKS/src/Root.tsx is auto-patched with a new <Composition>
   ↓
[Optional in dialog] "Also render 4K MP4" → spawns:
       cd "MOTION GRAFIKS" && npx remotion render <id> EXPORT/<id>.mp4
   ↓
[DaVinci Resolve] Import MOTION GRAFIKS/EXPORT/ → drop on timeline
```

If you skip the "Also render" checkbox, you can render later:

```bash
cd "/Users/micharoessler/Desktop/Projekte/Guada & Micha YT/MOTION GRAFIKS"
npx remotion render Scene03-Istanbul EXPORT/scene03-istanbul.mp4

# Or to see all scenes interactively:
npm start    # opens Remotion Studio at http://localhost:3001
```

---

## 6. Custom fonts

1. In any studio page, scroll the left panel to **Custom Fonts**.
2. Click the dashed box → pick a `.woff2`, `.ttf`, or `.otf` (multi-select OK).
3. The font is saved to BOTH `PROMPT STUDIO/public/fonts/` and `MOTION GRAFIKS/public/fonts/` so the live preview AND the rendered MP4 use the same file.
4. Click **Use** next to the font name to apply it as the primary font.

> The MOTION GRAFIKS render needs a `@font-face` declaration to actually use the font. Add this once to a global file there (e.g. in your scene component) when you start using custom fonts:
> ```css
> @font-face { font-family: 'MyFont'; src: url('/fonts/MyFont.woff2'); }
> ```

---

## 7. Presets

**Style presets** (top of every studio page, the "Save / N presets" bar):
- Captures only the style block (palette, fonts, typography, vignette, letterbox).
- Useful for show-wide brand consistency. Save "Guada & Micha Brand" once, load on every scene.

**Scene presets:**
- Captures the entire scene (style + spec).
- Useful for recurring scene templates ("Country opener template", "Population counter template").

All saved to `PROMPT STUDIO/presets/{styles,scenes}/*.json` (gitignored).

---

## 8. Style library

`/styles` page shows all 5 VOX color palettes with hex values, copy-able.
Use it as a reference when explaining brand color choices to collaborators.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Preview is blank / black | Open browser console — Mapbox often fails to load tiles silently if you exceeded the free tier. Check token in `.env.local`. |
| Exported scene doesn't show in Remotion Studio | The Root.tsx patch only triggers if the studio dev server can write. Check `MOTION_GRAFIKS_PATH` in `.env.local` is exact. |
| `npx remotion render` errors with `d3-geo doesn't exist` | `cd MOTION GRAFIKS && npm install d3-geo` (one-time, fixed for you already). |
| Font picker shows uploaded font but live preview uses fallback | Hard-refresh the browser (Cmd+Shift+R). The `@font-face` rule is injected on first load. |
| Lower third has black box around it instead of transparent | You're previewing in the studio (which uses dark bg). After render, the MP4 will have alpha if you used a transparent-capable codec — the box is just for visibility in the studio. |

---

## File layout reference

```
PROMPT STUDIO/                          ← this app
├── app/
│   ├── page.tsx                        ← dashboard
│   ├── studio/{map,dataviz,title,lowerthird}/page.tsx
│   ├── styles/page.tsx
│   └── api/{export-tsx,render,geocode,fonts,presets}/route.ts
├── src/
│   ├── remotion/                       ← live preview components
│   ├── lib/codegen/                    ← TSX emitters
│   ├── lib/presets/palettes.ts         ← 5 VOX palettes
│   └── components/
├── public/fonts/                       ← uploaded fonts (also copied to MOTION GRAFIKS)
└── presets/                            ← saved style + scene JSON

MOTION GRAFIKS/                         ← exports land here
├── src/
│   ├── Root.tsx                        ← auto-patched on every export
│   ├── Scene01-NanshanShenzhen.tsx     ← your existing scene
│   └── Scene{N}-{Name}.tsx             ← studio exports go here
├── public/
│   ├── fonts/                          ← synced from studio
│   └── *.geojson                       ← region polygons (manual)
├── EXPORT/                             ← rendered MP4s land here
└── mapbox.config.ts                    ← used by exported scenes
```
