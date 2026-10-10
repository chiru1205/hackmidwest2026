#!/usr/bin/env bash
# Civic Flow: provision / update ONE Ubuntu 24.04 Linode. Run ON the VM as root. Safe to re-run.
#
#   DOMAIN=civic.example.com bash provision.sh     # optional: use your own domain
#   bash provision.sh                              # default: <ip-with-dashes>.sslip.io
#
# deploy.ps1 uploads these into /root/cf-stage before calling this script:
#   web.tgz  (built frontend)   env  (server .env)   -> installed if present
# and extracts the app tarball into /opt/civicflow (so this file lives in /opt/civicflow/infra/linode/).
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

APP=/opt/civicflow
STAGE=/root/cf-stage
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # directory holding this script + templates

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARN: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (ssh root@<ip>)."
[ -f /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "Tested on Ubuntu 24.04; this is '${PRETTY_NAME:-unknown}'."
[ -f "$APP/backend/api/main.py" ] || die "App code not found in $APP (expected backend/api/main.py). Use deploy.ps1."
[ -f "$SRC/civicflow-api.service" ] && [ -f "$SRC/Caddyfile.template" ] || die "Missing civicflow-api.service or Caddyfile.template next to provision.sh."

# ---------------------------------------------------------------- domain
detect_ip() {
  local ip=""
  # Preferred: source address of the default route (Linodes have the public IPv4 on eth0).
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1 || true)"
  if ! printf '%s' "$ip" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
     || printf '%s' "$ip" | grep -Eq '^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)'; then
    ip=""
    local u
    for u in https://ifconfig.me https://api.ipify.org https://icanhazip.com; do
      ip="$(curl -4 -fsS --max-time 6 "$u" 2>/dev/null | tr -d '[:space:]' || true)"
      printf '%s' "$ip" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' && break
      ip=""
    done
  fi
  printf '%s' "$ip"
}

if [ -z "${DOMAIN:-}" ]; then
  command -v curl >/dev/null 2>&1 || { apt-get update -y >/dev/null; apt-get install -y curl >/dev/null; }
  PUBLIC_IP="$(detect_ip)"
  [ -n "$PUBLIC_IP" ] || die "Could not detect the public IPv4 address. Re-run with DOMAIN=<name that points at this server>."
  DOMAIN="${PUBLIC_IP//./-}.sslip.io"
  log "Public IP $PUBLIC_IP -> using $DOMAIN (sslip.io resolves this name to the IP)"
else
  log "Using DOMAIN=$DOMAIN (its DNS A record must point at this server)"
fi
printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' || die "DOMAIN '$DOMAIN' looks invalid."

# ---------------------------------------------------------------- packages
log "Installing base packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg apt-transport-https debian-keyring debian-archive-keyring \
  python3 python3-venv python3-pip python3-dev build-essential libjpeg-dev zlib1g-dev \
  ufw unattended-upgrades

# Caddy: official repo first, Ubuntu package as fallback.
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  if curl -1sLf --max-time 30 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
     && curl -1sLf --max-time 30 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list \
     && apt-get update -y && apt-get install -y caddy; then
    echo "Caddy installed from the official repository."
  else
    warn "Official Caddy repo failed; falling back to Ubuntu's caddy package."
    rm -f /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
fi

# Key-value server (Redis protocol): valkey first, redis-server fallback.
KV_SERVICE=""
KV_CONF=""
if systemctl list-unit-files 2>/dev/null | grep -q '^valkey-server\.service' || dpkg -s valkey >/dev/null 2>&1; then
  KV_SERVICE=valkey-server; KV_CONF=/etc/valkey/valkey.conf
elif systemctl list-unit-files 2>/dev/null | grep -q '^redis-server\.service'; then
  KV_SERVICE=redis-server; KV_CONF=/etc/redis/redis.conf
else
  log "Installing key-value server"
  if apt-get install -y valkey; then
    KV_SERVICE=valkey-server; KV_CONF=/etc/valkey/valkey.conf
  else
    warn "valkey is not available on this Ubuntu; using redis-server."
    apt-get install -y redis-server
    KV_SERVICE=redis-server; KV_CONF=/etc/redis/redis.conf
  fi
fi
if ! systemctl list-unit-files 2>/dev/null | grep -q "^${KV_SERVICE}\.service"; then
  # valkey package may name the unit 'valkey.service'
  if systemctl list-unit-files 2>/dev/null | grep -q '^valkey\.service'; then KV_SERVICE=valkey; fi
fi
if [ -f "$KV_CONF" ]; then
  # Bind to loopback only, keep protected mode on.
  if grep -Eq '^[[:space:]]*bind[[:space:]]' "$KV_CONF"; then
    sed -i -E 's|^[[:space:]]*bind[[:space:]].*|bind 127.0.0.1|' "$KV_CONF"
  else
    printf '\nbind 127.0.0.1\n' >> "$KV_CONF"
  fi
  if grep -Eq '^[[:space:]]*protected-mode[[:space:]]' "$KV_CONF"; then
    sed -i -E 's|^[[:space:]]*protected-mode[[:space:]].*|protected-mode yes|' "$KV_CONF"
  else
    printf 'protected-mode yes\n' >> "$KV_CONF"
  fi
else
  warn "Key-value config $KV_CONF not found; check that it only listens on 127.0.0.1."
fi

# ---------------------------------------------------------------- user and directories
log "Creating user and directories"
id civic >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin civic
mkdir -p "$APP/web" "$APP/data/photos"
chown -R civic:civic "$APP/data"
chmod 755 "$APP" "$APP/web"
chmod -R a+rX "$APP/backend" "$APP/contracts" "$APP/scripts" "$APP/infra" 2>/dev/null || true

# ---------------------------------------------------------------- frontend and .env from staging
if [ -f "$STAGE/web.tgz" ]; then
  log "Installing built frontend"
  find "$APP/web" -mindepth 1 -delete
  tar -xzf "$STAGE/web.tgz" -C "$APP/web"
  [ -f "$APP/web/index.html" ] || die "web.tgz did not contain index.html."
  chmod -R a+rX "$APP/web"
fi
[ -d "$APP/web" ] && [ -f "$APP/web/index.html" ] || warn "No frontend in $APP/web yet (index.html missing)."

PREV_ENV=""
if [ -f "$APP/.env" ]; then PREV_ENV="$(mktemp)"; cp "$APP/.env" "$PREV_ENV"; fi
if [ -f "$STAGE/env" ]; then
  log "Installing .env (mode 600)"
  install -o civic -g civic -m 600 "$STAGE/env" "$APP/.env"
  # Keep an existing basic-auth hash across redeploys when the new .env does not set one.
  if [ -n "$PREV_ENV" ] && ! grep -q '^CITY_PASS_HASH=' "$APP/.env"; then
    for k in CITY_USER CITY_PASS_HASH; do
      line="$(grep -m1 "^${k}=" "$PREV_ENV" || true)"
      [ -n "$line" ] && printf '%s\n' "$line" >> "$APP/.env"
    done
  fi
fi
[ -n "$PREV_ENV" ] && rm -f "$PREV_ENV"
[ -f "$APP/.env" ] || die "$APP/.env is missing. Upload it with deploy.ps1 (or create it by hand, mode 600)."
chown civic:civic "$APP/.env"; chmod 600 "$APP/.env"

# ---------------------------------------------------------------- python venv
log "Python environment"
[ -x "$APP/.venv/bin/python" ] || python3 -m venv "$APP/.venv"
REQ_HASH="$(cat "$APP/backend/requirements.txt" "$APP/backend/requirements-agents.txt" 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [ "$(cat "$APP/.venv/.req-hash" 2>/dev/null || true)" != "$REQ_HASH" ]; then
  "$APP/.venv/bin/pip" install --upgrade pip wheel
  "$APP/.venv/bin/pip" install -r "$APP/backend/requirements.txt"
  if [ -f "$APP/backend/requirements-agents.txt" ]; then
    "$APP/.venv/bin/pip" install -r "$APP/backend/requirements-agents.txt" \
      || warn "requirements-agents.txt failed to install (best effort). The app falls back to deterministic agents."
  fi
  echo "$REQ_HASH" > "$APP/.venv/.req-hash"
else
  echo "Requirements unchanged; skipping pip."
fi
chown -R civic:civic "$APP/.venv"

# ---------------------------------------------------------------- systemd unit
log "Installing systemd unit"
install -m 644 "$SRC/civicflow-api.service" /etc/systemd/system/civicflow-api.service

# ---------------------------------------------------------------- Caddy
log "Configuring Caddy for $DOMAIN"
mkdir -p /etc/caddy
sed "s|{\$DOMAIN}|${DOMAIN}|g" "$SRC/Caddyfile.template" > /etc/caddy/Caddyfile

# Optional basic auth for /api/admin/* (only when CITY_PASS_HASH is set in .env).
CITY_USER_V="$(grep -m1 '^CITY_USER=' "$APP/.env" | cut -d= -f2- | tr -d '\r"'"'"' ' || true)"
CITY_HASH_V="$(grep -m1 '^CITY_PASS_HASH=' "$APP/.env" | cut -d= -f2- | tr -d '\r"'"'"' ' || true)"
AUTH_FILE=/etc/caddy/civicflow-admin-auth.caddy
if [ -n "$CITY_HASH_V" ]; then
  : "${CITY_USER_V:=city}"
  printf 'basicauth {\n\t%s %s\n}\n' "$CITY_USER_V" "$CITY_HASH_V" > "$AUTH_FILE"
  AUTH_STATE="ON (user: $CITY_USER_V)"
else
  printf '# Admin basic auth is OFF (CITY_PASS_HASH not set in %s/.env).\nheader X-Civicflow-Admin-Auth off\n' "$APP" > "$AUTH_FILE"
  AUTH_STATE="off"
fi
chown root:caddy "$AUTH_FILE" 2>/dev/null || true
chmod 640 "$AUTH_FILE"

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  || { caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true; die "Caddyfile is invalid (see above)."; }

# ---------------------------------------------------------------- firewall
log "Firewall (ufw): allow 22, 80, 443 only"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null     # tcp + udp (HTTP/3)
ufw --force enable >/dev/null

# ---------------------------------------------------------------- unattended upgrades (security only, default)
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

# ---------------------------------------------------------------- start everything
log "Starting services"
systemctl daemon-reload
if [ -n "$KV_SERVICE" ]; then
  systemctl enable "$KV_SERVICE" >/dev/null 2>&1 || true
  systemctl restart "$KV_SERVICE" || warn "$KV_SERVICE did not start; the app falls back to in-memory cache."
fi
systemctl enable civicflow-api >/dev/null 2>&1
systemctl restart civicflow-api
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy

sleep 3
API_OK=no
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then API_OK=yes; break; fi
  sleep 1
done

# ---------------------------------------------------------------- summary
echo
echo "=============================================================="
echo " Civic Flow provisioned"
echo "=============================================================="
echo " Site:            https://$DOMAIN/"
echo " API (local):     $API_OK  (http://127.0.0.1:8000/api/health)"
echo " Key-value:       ${KV_SERVICE:-none} ($(systemctl is-active "${KV_SERVICE:-none}" 2>/dev/null || echo unknown))"
echo " API service:     $(systemctl is-active civicflow-api || true)"
echo " Caddy:           $(systemctl is-active caddy || true)"
echo " Admin auth:      $AUTH_STATE"
echo " Logs:            journalctl -u civicflow-api -f   |   journalctl -u caddy -f"
echo "=============================================================="
if [ "$API_OK" != "yes" ]; then
  warn "API did not answer in 30 s. Last log lines:"
  journalctl -u civicflow-api -n 30 --no-pager || true
  exit 1
fi
printf '%s\n' "$DOMAIN" > "$APP/.domain"
