# 🚀 Launch Checklist — Mapanisy / Prompt Studio MVP

Last verified: 2026-07-03 (all ✅ items machine-verified on this codebase).

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
   - `.env.production` (runtime): copy from `.env.production.example`, fill `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`
6. **Caddy**: copy `Caddyfile` to `/etc/caddy/Caddyfile`, set your domain, `systemctl reload caddy`.
7. **DNS**: `A @ → VPS IP`, `A www → VPS IP`.
8. **Launch**: `docker compose up -d --build` (first build ~5–8 min).
9. **Verify**: `curl https://<domain>/api/health` → `"ready": true`, then generate + render one film end-to-end.

## ⚠️ Known decisions / deferred (fine for MVP)

- **Branding**: landing says "Prompt Studio", the app says "Mapanisy" — pick one before marketing pushes (grep for both).
- **Database**: optional at launch — file store under the `data/dev` volume works for MVP; add Postgres (`DATABASE_URL`) when multi-user grows.
- **Stripe**: skip until billing goes live; free tier needs no Stripe. Price IDs go in `.env.production` later.
- **R2/S3 storage**: renders stream from the app volume for now; add R2 for CDN delivery later.
- **drizzle.config.ts** uses the installed drizzle-kit 0.18 flat API — if you bump drizzle-kit, switch back to the `dialect` shape.

## Minimum env for `ready: true`
```
CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
ANTHROPIC_API_KEY   # or users bring their own key in Settings
```
