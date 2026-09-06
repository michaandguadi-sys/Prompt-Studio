# Mapanisy — Final Finish & VPS Deploy Plan

_Generated 2026-09-05 on branch `security-hardening`. Every claim below traces to
a file that was opened; anything unverified says so._

---

## 0. Verdict

**It is deployable now, and it was not when this session started.** Three
separate faults made a working VPS deploy impossible, and none of them would
have produced a useful error message: `npm ci` failed to resolve so
`docker build` could never finish; `header_up` sat at site level in the Caddyfile
where Caddy rejects it and refuses to start; and `docker-compose` read
`NEXT_PUBLIC_*` build args from a `.env` file that had no template, so the image
would have built "successfully" with a blank Clerk key and every sign-in would
have failed at runtime. All three are fixed and verified.

Beyond the deploy itself, the audit found the app is **better built than its
launch docs claim**, with a real cluster of fail-open bugs around identity and
metering. The most serious was not a security hole but a lockout: `resolveUserId`
returned `null` when a `users` row did not exist yet, and every caller reads
`null` as 401 — so on a deploy without `CLERK_WEBHOOK_SECRET` (documented as
**optional**) project saving was permanently broken for everyone.

Gates are green: `tsc --noEmit` exit 0, `npm run build` exit 0 (61/61 static
pages), `/api/health` returns `ready: true` under the documented minimum env,
verified by booting the real production server.

**Not verified locally:** Docker and Caddy are not installed on this machine, so
the image build, the container run and `caddy validate` must be confirmed on the
VPS. That is the one remaining unknown.

---

## 1. Blockers — all fixed this session

| # | Component | Issue | File | Status |
|---|---|---|---|---|
| 1 | Deps | `npm ci` ERESOLVE — react pinned `19.0.0`, Clerk requires `>=19.0.3`. `docker build` could not complete. | `package.json` | ✅ → `19.0.8` |
| 2 | Deploy | `header_up` at site level; Caddy rejects it as an unknown directive and will not start. | `Caddyfile` | ✅ moved inside `reverse_proxy` |
| 3 | Deploy | No template for the build-arg `.env`; Compose substitutes empty strings and only warns → blank Clerk key baked into the client bundle. | `.env.example` | ✅ created |
| 4 | Security | App published on `0.0.0.0:3030` — reachable over plain HTTP, bypassing Caddy and TLS entirely. Docker's iptables rules bypass `ufw`, so a firewall would not have closed it. | `docker-compose.yml` | ✅ bound to `127.0.0.1` |
| 5 | Auth | `resolveUserId` → `null` when no `users` row → **401 for a signed-in user**. Normal state without the optional webhook secret. | `src/lib/auth/resolveUserId.ts` | ✅ provisions on demand |
| 6 | Deploy | Runtime image never copied `packages/`, so `/api/agent/script` 500s and the Render Agent install the dashboard hands out is dead. | `Dockerfile` | ✅ `COPY packages` |
| 7 | Ops | `/api/health` `ready` required Postgres + R2 + Mapbox, all documented **optional** — the runbook's own verification step could never pass. | `app/api/health/route.ts` | ✅ matches documented minimum |
| 8 | Repo | 662 MB of webpack cache committed (574 files, 61% of the repo); bare `.env` not gitignored. | `.gitignore`, git history | ✅ purged, 475 MB → 5.2 MB |

---

## 2. Repo preparation — done

The history rewrite touched only unpushed commits, so **`git push` fast-forwards;
no force-push is needed.**

Verified before touching anything: no `.env` or `.clerk` file appears anywhere in
103 commits, and no live key pattern (`sk_live_`, `sk-ant-`, `whsec_`, `AKIA`,
`postgres://…@`) exists in any tracked file.

```bash
git push origin security-hardening
```

State now: **354 tracked files** (was 937), **5.16 MiB** packed (was 475 MB).

---

## 3. Component-by-component

### 3.1 Repo hygiene — was `broken`, now `solid`
574 of 937 tracked files were `.next-verify/` webpack cache. All 5 commits
carrying it were unpushed, so history was rewritten surgically — verified with
`git diff backup..HEAD`: **574 files differed, 0 of them source.** `projects-v2/`
(4.2 MB of test projects) was gitignored yet still tracked; now untracked,
files kept on disk. `.gitignore` now ignores `.env`/`.env.*` (re-allowing the
templates) and `.next-*/`.

### 3.2 Deploy / Docker / Caddy — was `broken`, now `solid` (pending VPS confirmation)
Blockers 1–4 and 6 above. Also added `ufw` (deny incoming; SSH/80/443) and a
4 GB swapfile to `vps-setup.sh` — Chromium composites 4K frames and an OOM kill
during a render takes the web server down with it. `npm prune --omit=dev` was
checked and is **correctly ordered**: `@remotion/bundler` is a devDep but only
`scripts/build-bundle.mjs` imports it, and that runs during `npm run build`,
before the prune.

### 3.3 Auth, middleware, rate limiting — `needs-work`
Core is solid: every Clerk-public route except `/api/agent/script` re-authenticates
in-handler, both webhooks verify signatures against the raw body before trusting
the payload, and no path-traversal sink exists (share token is regex-pinned,
FS ids go through `safeId()`). `TEST_UNLIMITED` / `BYPASS_QUOTA` provably fail
closed in production.

**Open — the tile-cache disk leak (high).** `/api/sat` and `/api/dem` fetch with
`cache: "force-cache"`, which persists every tile into Next's on-disk fetch cache
with no eviction. Measured on this machine: **442 MB across 17,642 entries, 100%
tile bodies.** Both routes are public; the only limit is 500 req/min per IP. In
the container that lands in the writable layer (`.next` is not a mounted volume),
so it fills the host disk. Do not simply remove `force-cache` — it is what stops
ArcGIS throttling a headless render at ~100 tiles/s. Bound it instead.

### 3.4 v2 API routes — `minor-issues`
Genuinely good: every route calls `auth()` at the handler, ownership scoped on
both DB and FS paths, `aiComplete` already has AbortController timeouts and SSRF
validation on BYO base URLs. **No IDOR, no auth bypass, no key leak found.**
Remaining: `/api/v2/generate` calls Nominatim with un-timeouted, unbounded-parallel
fetches (high); `/api/v2/sequence` trusts `req.json()`; restyle polling puts a BYO
API key in a GET query string.

### 3.5 Render pipeline — `minor-issues`, three real bugs fixed
Concurrency was **fine all along** — `MAX_CONCURRENT = 1`, Remotion at
`min(4, floor(cpus/2))` = 2 tabs on 4 vCPU. My initial worry about unbounded
Chromium was wrong.

Three genuine defects fixed: `finish()` was not idempotent (`error` + `close` both
fire → `runningCount` goes **negative** → the concurrency check never binds again
→ unbounded parallel renders); a paused job held the only slot forever, blocking
every user; and `.renders/` grew without bound because the sweep only walked the
in-memory job map, which is empty after a restart. Also fixed
`RENDER_CONCURRENCY` being passed to Remotion as a string.

### 3.6 v2 editor — `minor-issues`
Better than its 15.3k LOC suggests: subscriptions are fine-grained (2 whole-project
selectors out of ~120), listeners and rAF loops all clean up. **Error boundaries
exist** — `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` and a
purpose-built `ErrorBoundary.tsx` — but the latter wraps only `Canvas`, so an
Inspector or Timeline throw still unmounts the editor.

Fixed: `duplicateLayer` threw a `ZodError` on **every** invocation (`id: undefined`
spread last clobbered the generated id), so ⌘D, the Layers panel and LayerHalo all
silently did nothing. Proven by executing the real factory.

Open: timeline drag writes ~60 full-project undo snapshots/sec; every store write
re-serialises the whole project to `localStorage`, including the playhead at 24–30 fps.

### 3.7 Landing / home / dashboard / share — `minor-issues`
Public surfaces degrade fine on a phone (`clamp()` type, `sm:`/`md:` breakpoints);
the share viewer has a proper loading/error/player triad; dashboard has real
empty, folder-empty and retryable-error states.

**The gap is the editor on mobile (high).** At `/studio2` the two rails are
fixed-width flex children with no shrink guard and the panel toggles are hidden
below `md`, so the canvas collapses to zero width. A friend opening your link on
a phone lands on a blank editor. Also: `/v/[token]` unfurls with no OG image, and
with Stripe unset `/pricing` shows a permanently disabled Upgrade button with no
explanation.

### 3.8 Persistence — `minor-issues`
More honest than most dual stores: the FS fallback keeps the same per-user scoping,
all 27 `db`-touching routes guard with `if (!db)`, the postgres.js client is a
correct module singleton, and tier resolution fails closed without a DB.
Gaps are durability: FS writes are truncate-in-place with no temp+rename, so an
interrupted save silently drops a project; no backup for the volumes; `db:push`
has no migrations directory and `db:migrate` points at a path that does not exist.

### 3.9 Billing / quota / watermark — was `needs-work`, fixed
**The watermark question is settled.** On the cloud render path it is resolved
server-side, written into `inputProps` and drawn in the composition — it cannot be
tampered with. Stripe checkout and the webhook are correct: signature-verified,
price IDs allow-listed against `TIERS`, lifetime grants upserted, replays idempotent.

Fixed: the free tier's 3-render cap **never bound** (only the agent path wrote
`render_logs`; free users are forced onto the cloud path, which wrote nothing —
free rendering was effectively unlimited); `useTier` failed **open**, so a quota
hiccup gave a free user an unwatermarked export; and an unknown tier or a
`past_due` subscription kept full paid entitlement.

### 3.10 Legacy v1 layer — `needs-work`, **do not follow LAUNCH.md here**
The audit proved the reachability graph by grep. Confirmed orphaned:
`RenderQueueWidget`, `ToolsGrid`, `SceneFileIO`, `/api/scenes(+[id])`, and
`/api/ai/generate` (deleted this session).

**LAUNCH.md's orphan inventory is wrong in three ways**, and deleting the v1
layer as it describes would **break the shipping Remotion bundle and `/brand`**
(`src/remotion/root.tsx` still references it). It also claims
`GET /api/render-queue` "lists all jobs" — the code is already user-scoped. Treat
that section as untrustworthy until rewritten.

The six v1 `/studio/*` pages still ship and any signed-in user can reach them by
URL; `/studio/edit` (237 kB) and `/studio/map` (230 kB) are the heaviest routes in
the build.

---

## 4. Deliberately not done before this deploy

- **No sharp override.** Next bundles sharp 0.34.5 with libvips CVEs, but the app
  imports `next/image` **nowhere**, so the code is unreachable. Swapping a
  native-binding dependency to fix a dead path is the riskier trade. Instead
  `images.unoptimized` makes the unreachability enforced and closes `/_next/image`
  as an SSRF/CPU surface.
- **No postcss fix.** Build-time only, nested inside Next's own dependencies;
  npm's only fix is Next 16 (semver-major).
- **No deck.gl downgrade.** The `@loaders.gl` / `image-size` / `texture-compressor`
  advisories are real, but npm's "fix" is a **downgrade** to `@deck.gl` 9.0.6 from
  9.3.4 — backwards across a major. That is not a fix, and the map layers depend
  on 9.3.

> **Corrected 2026-09-06.** An earlier revision of this document claimed the only
> standing production findings were sharp and postcss. That was read off a
> truncated `npm audit` tail and was wrong: there were also **eight Next.js
> advisories**, three of them high and genuinely reachable (Server Actions DoS,
> Server Actions SSRF, rewrites SSRF, plus unauthenticated disclosure of internal
> Server Function endpoints). CI caught it. Fixed by bumping Next 15.5.20 →
> 15.5.25; `tsc` and `build` re-verified green.
- **No v1 deletion.** See 3.10 — the dependency graph does not match the docs.
  Needs its own session with the build as the gate.
- **No CSP.** Real work with MapLibre/deck.gl; the other headers are in place.
- **No control-kit consolidation.** Four Slider implementations is real
  duplication, but it is cosmetic churn across many files right before a deploy.

---

## 5. Deploy runbook

```bash
git push origin security-hardening
```

On the VPS, as root:

```bash
bash scripts/vps-setup.sh
```

```bash
git clone <your-repo-url> /opt/mapanisy && cd /opt/mapanisy
```

```bash
cp .env.example .env && cp .env.production.example .env.production
```

Fill `.env` (build-time: Clerk publishable key, `NEXT_PUBLIC_APP_URL`) and
`.env.production` (runtime: `CLERK_SECRET_KEY`, `ZAI_API_KEY`). Then:

```bash
docker compose up -d --build
```

```bash
sed -i 's/mapanisy\.com/YOUR-DOMAIN.com/g' /opt/mapanisy/Caddyfile && cp /opt/mapanisy/Caddyfile /etc/caddy/Caddyfile && caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

```bash
curl -s https://YOUR-DOMAIN.com/api/health | python3 -m json.tool
```

Expect `"ready": true`. The `mode` block tells you which optional integrations
are active. Then sign up as a new user and render one film end to end — that
exercises the two paths most likely to fail first (on-demand user provisioning,
and the render worker under SwiftShader).

---

## 6. Post-test backlog, in order

1. **Bound the tile fetch-cache** (3.3) — the most likely way the VPS dies quietly.
2. **Make the editor usable on mobile**, or show an explicit "desktop required"
   screen. A friend on a phone currently sees a blank canvas.
3. **Timeout the Nominatim fan-out** in `/api/v2/generate`.
4. **Rate-limit `/api/v2/share/[token]`** — public, unrate-limited, and on the
   file store it reads every project of every user per request.
5. **Atomic file-store writes** (temp + rename) and a volume backup.
6. Wrap Inspector and Timeline in the existing `ErrorBoundary`.
7. Coalesce timeline-drag undo snapshots; stop persisting the playhead.
8. Rewrite LAUNCH.md's orphan inventory, then delete the v1 layer with the build
   as the gate.
9. Add real tests. `tsc` + `build` + CI is a floor, not a safety net — the
   intent parser, quota gating and the story framework are where regressions hide.

---

## 7. Known product-level limitation

`interpret()` only forms a route when **two or more** places are in the hardcoded
gazetteer (~80 entries). Verified by running the real parser:

```
"Paris to Rome"        → route Paris → Rome        ✓
"Long Beach to Miami"  → highlight ["Miami"]       ✗ origin silently dropped
"Golden Gate Bridge"   → unknown, no locations     ✗
```

This is pre-existing, not a regression — the `>= 2` gate is in both the old and
new versions. Unrecognised places do fall through to the AI director and the
geocoder, so the product still works; but the deterministic path silently
discards half of a user's stated journey, which is exactly the moment the app is
supposed to feel like it understands the story.


---

## 8. Live deployment (2026-09-06)

**Running at https://mapinsy.com** — Hostinger KVM 2, `srv1569245` / 82.112.238.211,
in `/opt/mapanisy`, container `mapanisy`, alongside the existing site.

What the box actually turned out to be, versus what §5 assumed:

| Assumed | Actual |
|---|---|
| Caddy terminates TLS | **Traefik**, `network_mode: host`, docker-socket discovery |
| A shared docker network | Traefik is host-networked → service uses `network_mode: bridge` |
| KVM4, 4 vCPU / 16 GB | **KVM 2, 2 vCPU / 8 GB**, ~2.7 GB already in use |
| Swap present | **None** — 4 GB swapfile added; the build used 708 MB of it |
| `mapinsy.guadiandmicha.com` needs a new A record | **`mapinsy.com` already resolved here** and was serving nothing |

`mapinsy.com` was nominally claimed by `agentbirdie-app`, a container that had
restarted **19,210 times** (`fatal: destination path '/app' already exists`) and
returned HTTP 000. Its Traefik label was malformed —

    traefik.http.routers.agentbirdie.rule=Host(`mapinsy.com`)
     Host(`www.mapinsy.com/`)

a newline where `||` belongs, plus a trailing slash — so Traefik rejected the
whole rule and logged `invalid value for HostSNI matcher` every minute. It was
stopped (reversible: `docker start agentbirdie-app`), which is what let ACME
complete for `mapinsy.com`.

Deployed config: `docker-compose.vps.yml`, no published ports (Traefik reaches
the bridge IP), `mem_limit 4g`, `shm_size 1gb`, `RENDER_CONCURRENCY=1`,
persistence on the JSON file store (no `DATABASE_URL`), three data volumes under
`/opt/mapanisy/data`. `BYPASS_QUOTA` and `TEST_UNLIMITED` were deliberately not
shipped.

Verified from the public internet: `/` 200 with a valid Let's Encrypt cert
(CN=mapinsy.com, expires 2026-12-05), `/api/health` `ready: true`,
`/api/agent/script` **200 / 19,250 bytes** — confirming the Dockerfile
`COPY packages` fix, which returned 500 before. `/studio2` and `/home` 307 to
sign-in (Clerk gating, correct). `guadiandmicha.com` and `www` both still 200.

Two caveats: Clerk is a **development** instance (`pk_test`/`sk_test`) — fine for
testing, shows Clerk's dev banner, and swapping to production keys needs a
rebuild because the publishable key is baked into the client bundle. And renders
run on **software WebGL across 2 vCPU**, so expect minutes per film.

Update with: `cd /opt/mapanisy && git pull && docker compose -f docker-compose.vps.yml up -d --build`
