#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Mapanisy → guadiandmicha.com VPS (Hostinger KVM 2, Docker + Traefik template)
#
# Deploys Mapanisy as a SEPARATE container behind the Traefik that is already
# running. It publishes no ports and claims only its own subdomain, so the
# existing site on the apex domain is never touched.
#
# Run as root on the VPS:
#   bash deploy-vps.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/mapanisy}
APP_HOST=${APP_HOST:-mapinsy.guadiandmicha.com}
REPO=${REPO:-https://github.com/michaandguadi-sys/Prompt-Studio.git}
BRANCH=${BRANCH:-security-hardening}

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. Sanity ───────────────────────────────────────────────────────────────
command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose v2 plugin not found"

say "Existing containers (these must keep running untouched)"
docker ps --format '  {{.Names}}\t{{.Image}}\t{{.Ports}}'

# ── 1. Discover the running Traefik ─────────────────────────────────────────
say "Detecting Traefik"
TRAEFIK_CT=$(docker ps --filter "ancestor=traefik" --format '{{.Names}}' | head -1)
[ -z "$TRAEFIK_CT" ] && TRAEFIK_CT=$(docker ps --format '{{.Names}}' | grep -i traefik | head -1)
[ -z "$TRAEFIK_CT" ] && die "No running Traefik container found. Is this the Docker+Traefik template?"
echo "  container: $TRAEFIK_CT"

TRAEFIK_NETWORK=$(docker inspect "$TRAEFIK_CT" \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' \
  | grep -v '^bridge$' | grep -v '^host$' | head -1)
[ -z "$TRAEFIK_NETWORK" ] && die "Could not determine Traefik's docker network"
echo "  network:   $TRAEFIK_NETWORK"

# Entrypoint + certresolver come from Traefik's own flags/labels.
TRAEFIK_CFG=$(docker inspect "$TRAEFIK_CT" --format '{{json .Args}}{{json .Config.Labels}}' 2>/dev/null || true)
TRAEFIK_ENTRYPOINT=$(grep -oE 'entryPoints\.[A-Za-z0-9_-]+' <<<"$TRAEFIK_CFG" | sed 's/entryPoints\.//' \
  | grep -viE '^(web|http)$' | head -1)
[ -z "$TRAEFIK_ENTRYPOINT" ] && TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERTRESOLVER=$(grep -oE 'certificatesresolvers\.[A-Za-z0-9_-]+' <<<"${TRAEFIK_CFG,,}" \
  | sed 's/certificatesresolvers\.//' | head -1)
[ -z "$TRAEFIK_CERTRESOLVER" ] && TRAEFIK_CERTRESOLVER=letsencrypt
echo "  entrypoint:   $TRAEFIK_ENTRYPOINT"
echo "  certresolver: $TRAEFIK_CERTRESOLVER"
echo
echo "  If either of those two looks wrong, fix it in $APP_DIR/.env and re-run"
echo "  'docker compose -f docker-compose.vps.yml up -d' — nothing else changes."

# ── 2. DNS must already point here ──────────────────────────────────────────
say "Checking DNS for $APP_HOST"
MYIP=$(curl -fsS -m 10 ifconfig.me || true)
HOSTIP=$(getent hosts "$APP_HOST" | awk '{print $1}' | head -1 || true)
echo "  this VPS: ${MYIP:-unknown}   $APP_HOST → ${HOSTIP:-<unresolved>}"
if [ -z "$HOSTIP" ]; then
  die "$APP_HOST does not resolve. Add an A record → $MYIP, wait for propagation, re-run.
     Traefik cannot obtain a certificate until it resolves."
fi
[ "$HOSTIP" != "$MYIP" ] && echo "  WARNING: resolves elsewhere — TLS issuance will fail until it points here."

# ── 3. Code ─────────────────────────────────────────────────────────────────
say "Fetching code into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 50 origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth 50 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ── 4. Env ──────────────────────────────────────────────────────────────────
say "Environment"
if [ ! -f .env ]; then
  cp .env.example .env
  {
    echo ""
    echo "# --- set by deploy-vps.sh ---"
    echo "APP_HOST=$APP_HOST"
    echo "TRAEFIK_NETWORK=$TRAEFIK_NETWORK"
    echo "TRAEFIK_ENTRYPOINT=$TRAEFIK_ENTRYPOINT"
    echo "TRAEFIK_CERTRESOLVER=$TRAEFIK_CERTRESOLVER"
  } >> .env
  sed -i "s#^NEXT_PUBLIC_APP_URL=.*#NEXT_PUBLIC_APP_URL=https://$APP_HOST#" .env
  echo "  created .env — you must still fill NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
else
  echo "  .env exists, leaving it alone"
  for k in APP_HOST TRAEFIK_NETWORK TRAEFIK_ENTRYPOINT TRAEFIK_CERTRESOLVER; do
    grep -q "^$k=" .env || echo "$k=$(eval echo \$$k)" >> .env
  done
fi
[ -f .env.production ] || { cp .env.production.example .env.production; echo "  created .env.production — fill CLERK_SECRET_KEY + ZAI_API_KEY"; }
chmod 600 .env .env.production

missing=0
grep -qE '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_(live|test)_.' .env || { echo "  MISSING: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env"; missing=1; }
grep -qE '^CLERK_SECRET_KEY=sk_(live|test)_.'  .env.production || { echo "  MISSING: CLERK_SECRET_KEY in .env.production"; missing=1; }
grep -qE '^(ZAI_API_KEY|ANTHROPIC_API_KEY)=.\{8,\}' .env.production || { echo "  MISSING: ZAI_API_KEY (or ANTHROPIC_API_KEY) in .env.production"; missing=1; }
if [ "$missing" = 1 ]; then
  echo
  echo "  Fill those in, then re-run this script. Nothing has been started."
  exit 2
fi

# ── 5. Data dirs (uid 1000 = the 'node' user in the image) ──────────────────
say "Data volumes"
mkdir -p data/projects data/renders data/dev
chown -R 1000:1000 data
echo "  $APP_DIR/data/{projects,renders,dev}"

# ── 6. Build + start ────────────────────────────────────────────────────────
say "Building (first build is ~10-15 min on 2 vCPU)"
docker compose -f docker-compose.vps.yml build
say "Starting"
docker compose -f docker-compose.vps.yml up -d

# ── 7. Verify ───────────────────────────────────────────────────────────────
say "Waiting for health"
for i in $(seq 1 60); do
  st=$(docker inspect -f '{{.State.Health.Status}}' mapanisy 2>/dev/null || echo starting)
  [ "$st" = healthy ] && { echo "  healthy after ~$((i*5))s"; break; }
  [ "$st" = unhealthy ] && { docker compose -f docker-compose.vps.yml logs --tail=40 mapanisy; die "container unhealthy"; }
  sleep 5
done

say "Internal health"
docker exec mapanisy node -e "fetch('http://localhost:3030/api/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))" || true

say "Through Traefik (TLS may take ~60s on first issue)"
curl -sS -m 20 "https://$APP_HOST/api/health" | head -c 600 || echo "  not ready yet — retry in a minute"

say "The neighbouring site must still be up"
curl -sS -o /dev/null -w "  https://guadiandmicha.com → HTTP %{http_code}\n" -m 15 https://guadiandmicha.com/ || true

cat <<EOF

────────────────────────────────────────────────────────────
  App:    https://$APP_HOST
  Health: https://$APP_HOST/api/health   (expect "ready": true)
  Logs:   docker compose -f $APP_DIR/docker-compose.vps.yml logs -f
  Update: cd $APP_DIR && git pull && docker compose -f docker-compose.vps.yml up -d --build
────────────────────────────────────────────────────────────
EOF
