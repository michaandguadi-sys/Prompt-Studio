# Mapanisy

**The AI Map Story Builder.** Type *"I travelled across Patagonia"* and get a
cinematic map story you'd put in a YouTube documentary — not a GIS export.

Story first. Maps second. Technology third.

---

## What it is

A Next.js app that turns a sentence into a directed geographic film:

- **Generate** (`/home`) — describe your story; the AI director plans the beats,
  resolves the geography, and builds a storyboard on a live map.
- **Editor** (`/studio2`) — the v2 timeline editor: layers, keyframed camera
  moves, per-property animation, brand kits, undo/redo, autosave.
- **Render** — Remotion composites the film headlessly to MP4, up to 4K, either
  in-process on the server or via the optional render agent.
- **Share** (`/v/[token]`) — a public read-only viewer for a published project.

Auth is Clerk. Persistence is Postgres via Drizzle, with a JSON file-store
fallback so it runs with no database at all. Billing is Stripe (optional).

---

## Requirements

| | |
|---|---|
| Node | **22.x** (see `.nvmrc`; the Docker image is `node:22-bookworm-slim`) |
| npm | 10+ |
| Chromium | only for rendering — installed inside the Docker image |

---

## Run locally

```bash
nvm use
```

```bash
npm ci
```

```bash
cp .env.local.example .env.local
```

Fill in at minimum `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and
one AI key (`ZAI_API_KEY` is the built-in free story engine — see
[docs/ZAI_SETUP.md](docs/ZAI_SETUP.md)). Then:

```bash
npm run dev
```

The app runs at **http://localhost:3030**.

---

## Verify before you ship

Both must pass. There is no test suite yet — these are the gates.

```bash
npx tsc --noEmit
```

```bash
npm run build
```

A render smoke test (needs a local Chromium):

```bash
node scripts/smoke-render.mjs
```

---

## Deploy to a VPS

Full runbook: **[LAUNCH.md](LAUNCH.md)**. Short version:

```bash
sudo bash scripts/vps-setup.sh
```

```bash
cp .env.example .env && cp .env.production.example .env.production
```

`.env` holds **build-time** `NEXT_PUBLIC_*` values (baked into the client bundle
— a missing one silently ships an empty key). `.env.production` holds **runtime**
secrets. Neither is committed. Then:

```bash
docker compose up -d --build
```

```bash
curl https://your-domain.com/api/health
```

`"ready": true` means every required integration is wired. Put Caddy in front for
TLS — copy `Caddyfile`, replace the domain, then `caddy validate` and reload.

---

## Layout

```
app/            Next.js App Router — 18 pages, 51 API routes
  api/v2/       the shipping API (generate, edit, render, projects, share)
src/v2/         the v2 editor: doc model, layers, timeline, render, store, ui
src/lib/
  parse/        intent engine — spellfix, gazetteer, story framework, story arc
  ai/           AI director + provider layer (Z.ai GLM, Anthropic, BYO)
  presets/      map styles, Live Earth layers, brand kits
src/remotion/   the compositions Remotion renders
scripts/        render worker, bundle builder, smoke renders, VPS setup
```

---

## Known limitations

Honest list, kept current:

- **No automated tests.** `tsc` + `npm run build` are the only gates.
- **The intent gazetteer is a fixed list.** A route only forms when ≥2 places are
  in it, so `"Long Beach to Miami"` degrades to a single highlight instead of a
  route. Unrecognised places fall through to the AI director + geocoder.
- **Rate limiting is in-memory**, so it resets on container restart and is
  per-instance.
- **The render queue is not durable** — a restart loses in-flight jobs.
- **A legacy v1 layer still ships** (`/studio/*` pages and the old render
  routes). Gated by middleware, not in the nav, slated for deletion.
- **`db:push` has no migration files**, so schema changes are not reviewable.

See [LAUNCH.md](LAUNCH.md) for the full deferred list.
