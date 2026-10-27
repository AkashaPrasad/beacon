#!/usr/bin/env bash
# Deploy api + worker from this laptop WITHOUT a registry: build linux/arm64 images
# locally, stream them to the app box with `docker save | docker load`, then run the
# same server-side infra/compose/deploy.sh (which skips the pull when the tag exists).
#
#   scripts/deploy-api-direct.sh            build + ship + deploy
#   scripts/deploy-api-direct.sh --no-build ship the images already built for TAG
#
# Use this when the gh token has no write:packages scope; deploy-api-local.sh and the
# GitHub workflow are the registry-based equivalents.
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

BUILD=yes
[ "${1:-}" = "--no-build" ] && BUILD=no

load_secrets
require_vars APP_PUBLIC_IP SSH_PRIVATE_KEY_PATH
_ssh_key >/dev/null

OWNER=akashaprasad
REGISTRY=ghcr.io/$OWNER
SHA=$(git -C "$BEACON_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
TAG=${TAG:-sha-$SHA}

if [ "$BUILD" = yes ]; then
  docker info >/dev/null 2>&1 || die "Docker is not running"
  for app in api worker; do
    info "building $REGISTRY/beacon-$app:$TAG (linux/arm64)"
    docker buildx build "$BEACON_ROOT" \
      --file "$BEACON_ROOT/apps/$app/Dockerfile" \
      --platform linux/arm64 \
      --tag "$REGISTRY/beacon-$app:$TAG" \
      --label "org.opencontainers.image.revision=$SHA" \
      --load
  done
fi

for app in api worker; do
  info "shipping beacon-$app:$TAG to $APP_PUBLIC_IP"
  docker save "$REGISTRY/beacon-$app:$TAG" | gzip -1 |
    kssh "$APP_PUBLIC_IP" 'gunzip | docker load' | tail -1
done

BUNDLE=$(mktemp -d "${TMPDIR:-/tmp}/beacon-deploy.XXXXXX")
chmod 700 "$BUNDLE"
trap 'rm -rf "$BUNDLE"' EXIT
cp "$BEACON_ROOT/infra/compose/docker-compose.prod.yml" "$BEACON_ROOT/infra/compose/Caddyfile" \
  "$BEACON_ROOT/infra/compose/deploy.sh" "$BUNDLE/"
(umask 077 && compose_prod_env >"$BUNDLE/env")

info "uploading bundle"
kscp "$BUNDLE/docker-compose.prod.yml" "$BUNDLE/Caddyfile" "$BUNDLE/deploy.sh" "$BUNDLE/env" \
  "ubuntu@$APP_PUBLIC_IP:/opt/beacon/incoming/"

info "deploying $TAG"
kssh "$APP_PUBLIC_IP" "SKIP_PULL=1 bash /opt/beacon/incoming/deploy.sh '$TAG'"

curl -fsS -m 10 "${API_URL:-https://api-beacon.spacesdrive.cc}/healthz" >/dev/null &&
  info "public healthz OK" || die "public healthz failed"
