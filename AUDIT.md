# Mapanisy — Product, UX & Design Audit + Roadmap

_Last updated: 2026-06-16. A point-in-time strategic assessment. Backup of the project saved alongside the repo as `PROMPT-STUDIO-backup-2026-06-16` (source + user projects; node_modules/.next excluded as regenerable)._

> **Mission:** Build the most powerful yet easiest-to-use storytelling map-animation platform in the world — "ChatGPT meets Figma meets Google Earth Studio for storytellers."

---

## Phase 1 — First impressions (YouTuber / filmmaker / first-time user)

**The magic:**
- The promise — _"Turn any story — or any GPS track — into a cinematic 4K map"_ — is clear and differentiated. The dark "earth-at-night" hero reads premium, not "software."
- The core loop is genuinely novel: **type one sentence → answer 3–4 smart questions → get a finished, fact-checked, broadcast-ready animation.** No competitor does this.
- Output quality is real: chase-flyover over 3D satellite terrain, growing country highlights, the GPS elevation profile — motion-design work, not a toy.

**Confusing / unfinished:**
- **Four doors, unclear hierarchy** on home (AI box + GPX import + templates + projects). First-timers don't know where to start.
- **Editor is dense.** `/studio2` shows Layers + Inspector + timeline at once. Simple/Pro helps; the new "Quick adjust" panel should become the *default* surface.
- **No "what now?" moment** after generation — you land in the editor with no guided next step.
- **No social proof** on the landing (no example gallery / made-with reel).

---

## Phase 7.1 — Product Audit (current state)

**Strengths — a deep, real foundation:**

| Capability | Where it lives |
|---|---|
| AI narrative **interview** (prompt → tailored questions → plan) | `/api/v2/interview` + `AiIdeaBox` |
| Fact-checked **director brief** (thesis, sources, confidence) | `directorDoctrine` + `StoryboardReview` |
| **Multi-scene stories** with transitions + narration | `StoryComposition`, scenes model |
| **GPS track flythroughs** (GPX/TCX/KML/GeoJSON, 4 variants × 4 looks, elevation profile) | `src/v2/track`, `TrackLayer` |
| **Cinematic camera** presets + sliders (start auto-derived) | `CAMERA_MOVES`, `QuickAdjust` |
| **In-preview editing** (click-select, drag/scale/rotate, keyboard nudge) | `PreviewOverlay`, `Canvas` |
| **Signature styles** that grade cohesively | `signatureStyles`, `LookPanel` |
| **Edit by asking** (plain-English patches) | `/api/v2/edit`, `AiBar` |
| **Public share links** + read-only viewer | `/v/[token]` |
| **True 4K render** via self-hosted agent + **quota/tiers/Stripe/watermark** | `packages/agent`, `tiers`, `/api/v2/render` |

**Weaknesses / gaps:**
- No **inspiration-video import** (vision asks for it).
- No reusable **templates/presets** system beyond a small curated grid; no user-saved presets; **brand kits** not surfaced in-editor.
- No **collaboration** (single-user; folders are localStorage).
- **Example/template library is thin** — the biggest conversion lever is missing.
- **Editor chrome** is functional but not yet "Linear/Figma-grade."
- **Discoverability** of power features (OHM time-lapse, terrain, connections, spotlight) is low.

---

## Phase 7.2 — UX Audit (reduce clicks / decisions / increase confidence)

- **Collapse home to one hero action.** Prompt box front-and-center; GPX import + templates become quiet secondary chips. _(In progress.)_
- **Elevate the post-generate moment to a "Director's Cut" review** for single scenes too, not just stories — show the brief, look, pacing, and let the user open or refine before the dense editor. _(In progress.)_
- **Promote "Quick adjust" to the editor's default right-panel**; Layers/Inspector become an "Advanced" tab.
- **One-click "Make it a story"** from any single scene.
- **Persistent export/share action bar** (4K render / share link / download), always visible.
- **Keyboard-first**: a `⌘K` command palette ("add scene", "change look to noir", "fly to Tokyo").

---

## Phase 7.3 — Visual Design Audit

- **Unify on the dark cinematic identity.** Landing/share/auth are dark+premium; the editor is still the light "paper" theme — push the editor dark to match (storytellers work in dark tools: Resolve, Premiere, AE).
- **Propagate the slider-first kit** (filled-track sliders, pill toggles, chip pickers); retire remaining number inputs.
- **Add motion + delight** to panel transitions, hover states, empty states.
- **Tighten type & spacing** to a Linear-like rhythm (one type scale, more whitespace, fewer borders).

---

## Phase 7.4 — Feature Prioritization

**Must-have (next iteration):**
1. One-hero-prompt home + elevated **Director's Cut** review.
2. **Quick-adjust as the default editor panel** (dark theme).
3. **Template & example gallery** (10–15 stunning starters; "remix this").
4. **Persistent export/share action bar.**

**Should-have:**
5. **Brand kits** (logo, palette, fonts, lower-third) across scenes.
6. **User-saved presets** (look + camera as one click).
7. **⌘K command palette** + edit-by-asking everywhere.
8. **FIT import** (Garmin/Coros) — finishes the GPS story.

**Nice-to-have:**
9. **Inspiration-video import** → AI extracts pacing/style and matches it.
10. **Real-time collaboration** (multiplayer / comments).
11. **Template marketplace.**

---

## Phase 6 — Competitive benchmarking

| Tool | Better than us | Worse than us | Opportunity |
|---|---|---|---|
| **Google Earth Studio** | Real 3D globe, photoreal | Pure keyframing, no story/AI, steep | We own story + AI + ease |
| **GeoLayers 3** | Deep AE control | Requires After Effects, pro-only, hours | We own minutes-not-hours |
| **Mapme / TravelBoast** | Simple travel maps | Not cinematic, not 4K, no narrative | We own documentary quality |
| **Felt** | Real-time collab, beautiful maps | No animation/video | Borrow their collab + polish |
| **ArcGIS StoryMaps** | Scrollytelling, data | Not video, not cinematic | We own rendered film output |
| **Flourish** | Data-viz charts | Limited map camera | We already have counters/charts |
| **Mapbox Studio** | Style authoring | Not animation/story | Inspiration for our style editor |

**The gap nobody owns:** _AI-directed, fact-checked, cinematic map STORYTELLING that renders to 4K — with zero motion-design skill._ That is Mapanisy's wedge.

---

## Phase 7.5 — North Star (3 years)

> The default way the internet makes map stories. A creator describes an idea or drops a route, and Mapanisy directs, designs, narrates, and renders a broadcast-quality film — collaboratively, on-brand, in any aspect ratio — in minutes.

---

## Phase 7.6 — Next Version Proposal: "The Story Canvas"

Reorganize existing parts (no rebuild) into one confident, low-decision journey:

1. **One prompt or one file** (sentence, script, or GPX) →
2. **AI interview** (built) →
3. **Director's Cut**: a beautiful storyboard of auto-generated scenes with the fact brief, look, camera, pacing — each editable via chips/sliders; "add scene" / "make it a story" one-click →
4. **Editor (dark)** with Quick-adjust default + Advanced (layers) tab + ⌘K + edit-by-asking →
5. **Export bar**: 4K render / share link / brand kit, always present.

Every step already exists in some form — the work is to **elevate, combine, and clarify**, exactly per Phase 5.
