# 🚀 Launch Checklist — Mapanisy / Prompt Studio MVP

Last verified: 2026-08-02 — security/gating/billing/data hardening pass + DB
tooling fixed + editor perf. See "Security & data hardening (Aug 2026)" below.
Gates: `npx tsc --noEmit` clean · `npm run build` 61/61 · agent bundle rebuilt.

## ✅ Ready — verified working

| Area | Status |
|---|---|
| Production build | ✅ `npm run build` passes clean (Next app + Remotion render bundle) |
| Render engine | ✅ Smoke render: 4K composition renders headlessly via the app-origin bundle (`node scripts/smoke-render.mjs`) |
| One-click cloud render | ✅ Server worker + queue (pause/resume/retry/duplicate), agent optional |
| Landing page `/` | ✅ Public, no forced redirect, gold globe hero, SEO metadata + JSON-LD + FAQ |
| Social cards | ✅ `public/og-image.jpg` (1200×630, rendered from the product) |
| SEO plumbing | ✅ robots.txt (one domain, app routes disallowed), sitemap.ts (env-driven origin) |
| Generate page `/home` | ✅ Immersive live-map experience, verified place pins, GPX drop |
| Free-tier gating | ✅ Watermark via `useTier`, quota system, rate limiting on AI routes |
| Security | ✅ Headers in next.config.ts, SSRF-checked tile proxies, Clerk on all app routes |
| Docker deploy | ✅ Dockerfile + docker-compose.yml (KVM4-tuned) + Caddyfile + `scripts/vps-setup.sh` |
| Deploy verification | ✅ `GET /api/health` — booleans for every integration, `ready` flag |

## 🔲 Go-live steps (manual, ~1 evening)

1. **Merge `security-hardening` → `main`** when you're happy with the branch.
2. **Clerk production instance** ([dashboard.clerk.com](https://dashboard.clerk.com))
   - Add your domain, copy `pk_live_…` + `sk_live_…`
   - Webhook → `https://<domain>/api/webhooks/clerk` (user.created/updated/deleted) → `whsec_…`
3. **VPS** (Hostinger KVM4): run `scripts/vps-setup.sh` as root (installs Docker + Caddy, creates `/opt/mapanisy` + data dirs).
4. **Transfer code**: `git clone` your repo on the VPS (or rsync, excluding node_modules/.next).
5. **Env files on the VPS** (never committed):
   - `.env` (build args): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN=` (empty is fine)
   - `.env.production` (runtime): copy from `.env.production.example`, fill `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, and `ZAI_API_KEY` (the built-in AI story engine — see `docs/ZAI_SETUP.md`; `ANTHROPIC_API_KEY` etc. also work, or users BYO in Settings)
   - **If using Postgres** (multi-user): set `DATABASE_URL` and run **`npm run db:push`** once to create the tables (users, subscriptions, render_logs, projects_v2, restyle_jobs, scenes). Push-based — no migration files. (`npm install --legacy-peer-deps` if deps aren't installed yet.)
6. **Caddy**: copy `Caddyfile` to `/etc/caddy/Caddyfile`, set your domain, `systemctl reload caddy`.
7. **DNS**: `A @ → VPS IP`, `A www → VPS IP`.
8. **Launch**: `docker compose up -d --build` (first build ~5–8 min).
9. **Verify**: `curl https://<domain>/api/health` → `"ready": true`, then generate + render one film end-to-end.

## ⚠️ Known decisions / deferred (fine for MVP)

- **Branding**: ✅ resolved — uniformly "Mapanisy" across the app (0 "Prompt Studio" / "Mapinsy" left).
- **Orphaned v1 layer** (deferred, edge-gated & safe for MVP — middleware gates all of it): the old per-type `/studio/*` pages (map/edit/title/quote/lowerthird/dataviz) and the legacy render system (`src/lib/renderQueue.ts`, `/api/render`, `/api/render-queue` [+ `/[id]`], `/api/export-tsx`, `/api/ai/generate` [orphaned], `ExportDialog`, `RenderQueueWidget`) are superseded by the v2 editor (`/studio2`) and the v2 render path (`/api/v2/render` + `src/v2/ui/RenderQueue`). Not in the shipping nav. The redundant `RenderQueueWidget` was removed from `(studio)/layout.tsx`. Post-launch: delete the rest, or add `auth()`+rate-limit and scope `GET /api/render-queue` to the user (it currently lists all jobs). None are internet-reachable (Clerk middleware gates them).
- **Database**: optional at launch — file store under the `data/dev` volume works for MVP; add Postgres (`DATABASE_URL`) for real multi-user (accounts, billing, quota, cross-device library, share links). **Deploy the schema with `npm run db:push`** (push-based; no migration files). New-user provisioning is resilient: a sign-up with no row yet is granted the free tier and provisioned on demand (no webhook-race lockout).
- **Stripe**: skip until billing goes live; free tier needs no Stripe. When you go live, create the products + prices and set `STRIPE_PRICE_CREATOR` (monthly), `STRIPE_PRICE_CREATOR_ANNUAL` (yearly), and `STRIPE_PRICE_PRO` (a **one-time** price for the $250 lifetime tier) in `.env.production`. Checkout is mode-aware (subscription vs one-time); the webhook grants Pro-lifetime on `checkout.session.completed`, **upserts** the subscription (a paying user with no row still gets their tier), and **cancel/downgrade no longer wipes a lifetime grant**. Just add the Stripe endpoint + `STRIPE_WEBHOOK_SECRET`.
- **R2/S3 storage**: renders stream from the app volume for now; add R2 for CDN delivery later.
- **db:push tooling**: fixed — drizzle-kit upgraded 0.18→0.31 (matches drizzle-orm 0.45) and `drizzle.config.ts` modernized (`defineConfig` + `dialect` + `dbCredentials` + dependency-free `.env.local` loader). ⚠ Installing deps needs `npm install --legacy-peer-deps` (react 19 ↔ Clerk peer conflict).
- **Still deferred (post-launch):** agent `--key` moves from query string → header (needs an agent-CLI update); shared/Redis-backed rate limiting (current limiter is in-memory, per-instance); v1/v2 consolidation (delete orphaned `/studio/*` + legacy render/`/api/ai/generate`); brand-kit palette → v2 editor wiring (currently persists to the v1 studio store only).

## 🛡️ Security & data hardening (Aug 2026) — verified

- **Access:** new users can no longer be locked out of rendering (free-tier granted + provisioned on demand if the Clerk webhook lags/fails).
- **Billing:** subscription grants **upsert** (a paying user with no row still gets their tier); cancelling an unrelated subscription can't wipe a **lifetime Pro** grant.
- **IDOR closed:** agent `complete`/`progress` verify job ownership (a valid `--key` can't touch a stranger's render); restyle job polling is scoped to its owner; render file-download was already owner-scoped.
- **Cost/DoS:** `/api/v2/restyle` (the priciest AI call) is now rate-limited + quota-metered on the operator-credit path; AI-prompt inputs are size-capped (generate/edit/storyarc); per-user in-flight cloud renders capped.
- **Data safety:** save checks `res.ok` (no false "Saved"), ⌘S + debounced autosave, and full undo/redo for every edit (a drag = one ⌘Z).
- **Verified clean:** public share viewer (no XSS, graceful bad-token), video export (fallbacks), `TEST_UNLIMITED`/`BYPASS_QUOTA` fail-closed in prod.

## Minimum env for `ready: true`
```
CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
ZAI_API_KEY         # built-in AI story engine (free GLM tier) — see docs/ZAI_SETUP.md
                    # (ANTHROPIC_API_KEY etc. also work; users can BYO in Settings)
```
Optional (enable the matching feature): `DATABASE_URL` (multi-user; run `npm run db:push` after setting it) · `CLERK_WEBHOOK_SECRET` (clean signup sync) · `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_*` (billing) · R2 keys (CDN render delivery).

> ⚠️ **Never set `BYPASS_QUOTA` or `TEST_UNLIMITED` in production.** They hand out Pro/unlimited to everyone. They already fail-closed in prod builds, but keep them out of the production env entirely.
