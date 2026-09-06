#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Mapanisy — one-time VPS setup (Hostinger KVM4 / Ubuntu 22.04+)
# Run as root or with sudo on a fresh VPS:
#   curl -fsSL https://... | bash   OR   scp this file + run it
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> Installing Docker..."
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker && systemctl start docker
echo "Docker $(docker --version) installed."

echo "==> Installing Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y caddy
echo "Caddy $(caddy version) installed."

echo "==> Configuring firewall (ufw)..."
# Defence in depth. NOTE: Docker publishes ports via its own iptables chain and
# BYPASSES ufw, so this alone would NOT protect an app published on 0.0.0.0 —
# docker-compose.yml binds the app to 127.0.0.1 for that reason. ufw still
# matters for everything not published by Docker.
apt-get install -y ufw
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "Firewall active: SSH + 80 + 443 only."

echo "==> Ensuring swap exists (Chromium composites 4K frames; OOM kills renders)..."
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "4 GB swapfile created."
else
  echo "Swap already present — leaving it alone."
fi

echo "==> Creating app directory at /opt/mapanisy..."
mkdir -p /opt/mapanisy
cd /opt/mapanisy

echo "==> Creating data volumes (owned by Docker container user uid=1000)..."
mkdir -p data/projects data/renders data/dev
chown -R 1000:1000 data

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup done. Now do the following manually:"
echo ""
echo "  1. Get the code into /opt/mapanisy/ (git is preferred — it makes"
echo "     updates a one-liner: git pull && docker compose up -d --build):"
echo "       git clone <your-repo-url> /opt/mapanisy"
echo "     ...or rsync from your machine:"
echo "       rsync -avz --exclude node_modules --exclude '.next*' \\"
echo "         ./ root@YOUR_VPS_IP:/opt/mapanisy/"
echo ""
echo "  2. Create /opt/mapanisy/.env (build-time public vars):"
echo "       NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_..."
echo "       NEXT_PUBLIC_APP_URL=https://mapanisy.com"
echo "       NEXT_PUBLIC_MAPBOX_TOKEN="
echo ""
echo "  3. Create /opt/mapanisy/.env.production (runtime secrets):"
echo "       cp .env.production.example .env.production"
echo "       nano .env.production   # fill in keys"
echo ""
echo "  4. Copy Caddyfile:"
echo "       cp /opt/mapanisy/Caddyfile /etc/caddy/Caddyfile"
echo "       # Replace 'mapanisy.com' with your actual domain first!"
echo "       nano /etc/caddy/Caddyfile"
echo "       systemctl reload caddy"
echo ""
echo "  5. Point your domain's A record → $(curl -s ifconfig.me)"
echo "     (and AAAA if you have IPv6)"
echo ""
echo "  6. Build and start the app:"
echo "       cd /opt/mapanisy && docker compose up -d --build"
echo ""
echo "  7. Verify after ~2 minutes:"
echo "       curl https://mapanisy.com/api/health | python3 -m json.tool"
echo "       # Look for ready: true"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
