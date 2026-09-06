# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Mapanisy — production image (tested target: Hostinger KVM VPS, no GPU).
#
# Build (NEXT_PUBLIC_* values are INLINED at build time into both the Next
# client bundle and the Remotion render bundle — pass them as build args):
#
#   docker build \
#     --build-arg NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx \
#     --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
#     --build-arg NEXT_PUBLIC_APP_URL=https://your-domain.com \
#     -t mapanisy .
#
# Run: see docker-compose.yml (volumes for projects/renders, shm_size for
# Chromium, runtime secrets via env_file).
# ─────────────────────────────────────────────────────────────────────────────

########## Stage 1 — build ##########
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY . .
# Builds the Remotion render bundle (public/remotion-bundle) + the Next app.
RUN npm run build
# Drop devDependencies — the runtime needs next + @remotion/renderer (prod deps).
RUN npm prune --omit=dev

########## Stage 2 — runtime ##########
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3030 \
    # Headless server has no GPU → SwiftShader ANGLE keeps WebGL maps rendering.
    RENDER_GL=swangle \
    # The render worker fetches the bundle + tile proxies from the app itself;
    # inside the container that is always localhost (public DNS may not hairpin).
    RENDER_ORIGIN=http://localhost:3030

# Chromium (the render worker prefers /usr/bin/chromium — no runtime download),
# the shared libraries Remotion's compositor needs, and fonts so map labels and
# titles render (incl. CJK + emoji).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
      libpango-1.0-0 libcairo2 libcups2 ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/presets ./presets
# packages/agent/agent.mjs is read at runtime by GET /api/agent/script, which the
# dashboard tells users to curl to install the Render Agent. Without this the
# route 500s in the container and the whole "render on your own machine" flow —
# the reason paid tiers get unlimited renders — is dead on the VPS.
COPY --from=builder /app/packages ./packages

# Writable runtime dirs (mounted as volumes in compose so they persist).
RUN mkdir -p .renders projects-v2 .dev-data && chown -R node:node /app
USER node

EXPOSE 3030
# dumb-init reaps zombie Chromium processes the render worker spawns.
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
