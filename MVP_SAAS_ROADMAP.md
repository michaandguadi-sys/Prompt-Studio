# PROMPT STUDIO — MVP SaaS Roadmap

The studio works great as a local tool. To ship as a **paid cloud subscription product**, here's the minimum viable path — opinionated, focused on revenue ASAP.

## North star
**A solo travel/documentary YouTuber subscribes for $29/mo to make Vox-style map animations 10× faster than After Effects, with no installs and no Mapbox/Remotion expertise.**

---

## Phase 1 — Cloud-ready (2 weeks, ~$0 infra cost to ship)

### 1. Authentication
**Clerk** ($25/mo for 10K MAU). Drops into Next.js in ~1 hour.
- Email + password
- Google OAuth
- Magic links

### 2. Database
**Supabase** (free tier: 500 MB Postgres + 1 GB storage).
- Schema:
  - `users` (linked to Clerk ID)
  - `scenes` (user_id, spec JSONB, name, kind, created_at, updated_at)
  - `style_presets` (user_id, name, palette + typography JSONB, public bool)
  - `renders` (user_id, scene_id, status, output_url, settings, started_at, finished_at)
- Replace the in-memory render queue + localStorage scene persistence with DB-backed.

### 3. Cloud rendering
**Remotion Lambda** ($0.10 per minute of rendered video, no upfront cost).
- Replace the local `spawn("npx remotion render")` with `renderMediaOnLambda()`.
- ~30 second setup per Lambda function.
- Output goes to S3 → signed URL for download.
- Render queue stays UI-only (the backend just dispatches Lambda calls).

### 4. Storage
**Cloudflare R2** ($0.015/GB/mo, no egress fees — much cheaper than S3 for our pattern).
- User-uploaded fonts → R2
- Rendered MP4s → R2 (signed URLs, 7-day expiry on free tier)
- Custom map images for highlight pins → R2

### 5. Billing
**Stripe** (2.9% + $0.30 per transaction, no monthly fee).
- One plan to start: **Creator — $29/mo**
  - 60 minutes of rendered video per month
  - 10 saved scenes
  - 5 style presets
  - 1080p + 4K renders
  - Watermark-free
- **Studio — $99/mo** (upgrade path)
  - 300 minutes/month
  - Unlimited scenes & presets
  - ProRes 4444 alpha exports
  - Team seats (3)
  - Priority render queue
- **Free tier**: 5 minutes/month, watermarked, 1080p only. Critical for top-of-funnel.

### 6. Quota enforcement
Middleware that checks `renderMinutesUsedThisMonth` before dispatching a render. Display remaining minutes in the queue widget.

### 7. Landing page
A real one. Single page:
- Hero with a 5-second video of a Vox-style animation
- "Make Johnny-Harris-quality maps in 5 minutes" (replace headline as needed)
- 3 feature blocks: Cinematic camera · 8 transport modes · DaVinci-ready exports
- Pricing comparison (Free / Creator / Studio)
- Email signup → instant onboarding

---

## Phase 2 — Activation & retention (next 2 weeks)

### 8. Onboarding flow
On first sign-in:
- Pick "Travel docs" / "News explainer" / "Real estate" / "Other"
- Show a 60-second video tour of the Map studio
- Pre-fill a sample scene + render it for them → "Here's your first cloud render"

### 9. Template library
10 hand-crafted starter scenes per persona. The biggest activation lever.
- "Country opener" (Vox style)
- "City reveal" (Johnny Harris style)
- "Conflict zone explainer"
- "Travel route — flight"
- "Travel route — road trip"
- "Election map" (choropleth-ready)
- "Earthquake / weather event"
- "Restaurant tour pin"
- "Real estate property"
- "Hiking trail walkthrough"

### 10. Sharing
- Each scene has a public URL (read-only). Watch the live preview in-browser, no download.
- "Fork this scene" button for paid users — copies into their library.
- This is the viral loop. Show the URL in the render-done email.

### 11. Email notifications
- Render done → email with the .mp4 link.
- Weekly digest: "Your top scene this week: …"
- Re-engagement: "Haven't created in 7 days?"

### 12. Analytics
**PostHog** (free up to 1M events/mo). Critical funnel metrics:
- Sign-up → first render (target: ≥60%)
- First render → second render (≥40%)
- Free user → paid (≥3%)
- Monthly active rate (≥50%)

---

## Phase 3 — Differentiation (month 2)

### 13. AI brand auto-tune (already scaffolded on `/brand` page)
- Drop reference images → Claude returns a complete StylePreset
- This is the "lazy creator" pitch — biggest moat vs After Effects.
- ~$0.05 per analysis (Claude API).

### 14. Script-to-scenes
- Paste a YouTube script → Claude identifies locations + suggests a scene sequence.
- Auto-creates 3-5 scenes with the user's brand preset.
- "Coffee → script → 5 ready-to-render scenes in 90 seconds" is the demo.

### 15. Episode mode
- Group scenes into "episodes" (a video).
- Render the whole episode as one MP4 with transitions.
- This is the workflow killer-feature that pulls users off Premiere/DaVinci.

### 16. NLE exports
- FCPXML (Final Cut + DaVinci) for editable handoff.
- Adobe MOGRT for Premiere.
- "I want to keep my color grade in DaVinci but use your maps" use case.

---

## Phase 4 — Scale (month 3+)

### 17. Team workspaces
Shared scenes + presets across a team. Studio plan +$15/seat.

### 18. API + Zapier
Auto-generate maps from external triggers (news API, RSS, Google Sheets).

### 19. Stock map kit
Pre-rendered + customizable templates. $5-15 each, revenue share with creators.

### 20. Webhooks
Notify Slack/Discord when renders complete. CI-style workflows for content teams.

---

## What we DON'T need for MVP

- Multi-tenant isolation beyond per-row Postgres RLS (Supabase handles)
- WebGL editing in the picker (3D terrain is read-only)
- Real-time collab (defer to v3 — most users are solo)
- Mobile app (web-only first)
- Native desktop app (Electron is dead weight)
- Plugin marketplace (premature)
- Server-side rendering of the preview (overkill)

---

## Sequencing tip

Ship Phase 1 in a single 2-week sprint. The path-of-least-resistance:
**Day 1-2** Clerk + Supabase
**Day 3-5** Remotion Lambda integration
**Day 6-7** Stripe + plans
**Day 8-9** Landing page + onboarding stub
**Day 10-12** Polish + dogfood
**Day 13-14** Launch on ProductHunt + IndieHackers

Soft-launch to 50 beta users at $9/mo for the first 3 months to validate retention before scaling to $29.

## Pricing notes
- $29/mo is the "starts to feel real" threshold for solo creators
- 60 render minutes at $29 = $0.48/min user-side, $0.10/min cost = **~80% gross margin**
- Lambda timeouts: a 60s render at 4K uses ~4 min of Lambda time (4× parallelism), so plan accordingly
- Free tier with watermark is essential — 80% of conversions come from watermark removal psychology

---

## Critical NOT-yet-shipped items the local studio still needs

To make the SaaS launchable, the local studio should first:
1. ✅ Have queue + background rendering (DONE)
2. ✅ Quality/bitrate sliders (DONE)
3. ✅ Folder export (DONE)
4. ⏳ Public scene sharing URL (Phase 2)
5. ⏳ Episode mode (Phase 3)
6. ⏳ Auth-gated state (today everything is local — needs DB persistence)

The local studio is already 85% of the cloud SaaS — most of v5 work translates directly.
