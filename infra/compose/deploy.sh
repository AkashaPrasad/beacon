#!/usr/bin/env bash
# Server-side deploy step, run ON the app box as `ubuntu`:
#   bash /opt/beacon/incoming/deploy.sh <image-tag>
# Used by .github/workflows/deploy-api.yml and scripts/deploy-api-local.sh.
#
# Expects in /opt/beacon/incoming/: docker-compose.prod.yml, Caddyfile, deploy.sh,
# and optionally env (the new /opt/beacon/.env). Optional environment:
#   GHCR_USER / GHCR_TOKEN  registry login for private GHCR packages (logged out after pull)
set -euo pipefail

TAG=${1:-latest}
ROOT=/opt/beacon
IN=$ROOT/incoming
HEALTH_URL=${HEALTH_URL:-https://api.beacon.spacesdrive.cc/healthz}

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

[ -d "$IN" ] || { echo "missing $IN" >&2; exit 1; }
cd "$ROOT"

# 1) Files. The Caddyfile is rewritten in place (same inode) because it is a
#    single-file bind mount; replacing the file would leave Caddy on the old one.
install -m 0644 "$IN/docker-compose.prod.yml" "$ROOT/docker-compose.prod.yml"
touch "$ROOT/Caddyfile"
cat "$IN/Caddyfile" >"$ROOT/Caddyfile"
if [ -f "$IN/env" ]; then
  install -m 0600 "$IN/env" "$ROOT/.env"
  rm -f "$IN/env"
  log ".env updated"
fi
[ -s "$ROOT/.env" ] || { echo "$ROOT/.env is missing or empty" >&2; exit 1; }
chmod 600 "$ROOT/.env"

# 2) Compose interpolation file (image tag + optional overrides; no secrets).
touch "$ROOT/compose.env"
grep -v '^BEACON_TAG=' "$ROOT/compose.env" >"$ROOT/compose.env.tmp" || true
printf 'BEACON_TAG=%s\n' "$TAG" >>"$ROOT/compose.env.tmp"
mv "$ROOT/compose.env.tmp" "$ROOT/compose.env"

dc() { docker compose --env-file "$ROOT/compose.env" -f "$ROOT/docker-compose.prod.yml" "$@"; }
dc config --quiet

# 3) Pull (private-package fallback: short-lived login).
logged_in=no
if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-akashaprasad}" --password-stdin >/dev/null
  logged_in=yes
fi
pull_ok=yes
dc pull --quiet || pull_ok=no
[ "$logged_in" = yes ] && docker logout ghcr.io >/dev/null 2>&1 || true
[ "$pull_ok" = yes ] || { echo "image pull failed (are the GHCR packages public? see docs/INFRA.md)" >&2; exit 1; }

# 4) Roll.
dc up -d --remove-orphans
dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  || log "caddy reload skipped (container just (re)started)"

# 5) Wait for container health.
for svc in api worker; do
  cid=$(dc ps -q "$svc")
  for _ in $(seq 1 60); do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)
    [ "$state" = healthy ] && break
    sleep 3
  done
  log "$svc: $state"
  if [ "$state" != healthy ]; then
    dc logs --tail=80 "$svc" || true
    echo "$svc did not become healthy" >&2
    exit 1
  fi
done

# 6) Public smoke test through Cloudflare (allow time for first certificate issuance).
for _ in $(seq 1 30); do
  if curl -fsS -m 10 "$HEALTH_URL" >/dev/null 2>&1; then
    log "smoke OK: $HEALTH_URL"
    docker image prune -f >/dev/null 2>&1 || true
    dc ps
    exit 0
  fi
  sleep 5
done
echo "smoke test failed: $HEALTH_URL" >&2
dc logs --tail=50 caddy || true
exit 1
