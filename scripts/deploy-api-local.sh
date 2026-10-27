#!/usr/bin/env bash
# Deploy api + worker from this laptop: the same thing deploy-api.yml does.
#   1. buildx linux/arm64 images -> GHCR (login with `gh auth token`)
#   2. bundle compose + Caddyfile + deploy.sh + .env (from secrets.env) -> /opt/beacon/incoming
#   3. ssh: infra/compose/deploy.sh <tag>  (pull, up -d, health, public smoke test)
#
#   scripts/deploy-api-local.sh             build + push + deploy
#   scripts/deploy-api-local.sh --no-build  redeploy an existing tag (TAG=sha-... or latest)
#
# Needs: Docker running (buildx), gh token with write:packages
#   (gh auth refresh -h github.com -s write:packages,read:packages), SSH from this IP
#   (admin_cidr; re-run scripts/infra-tfvars.sh + terraform apply if your IP changed).
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

BUILD=yes
[ "${1:-}" = "--no-build" ] && BUILD=no

load_secrets
require_vars APP_PUBLIC_IP SSH_PRIVATE_KEY_PATH
_ssh_key >/dev/null

OWNER=akashaprasad
REGISTRY=ghcr.io/$OWNER
SOURCE_URL=https://github.com/${GITHUB_REPO:-AkashaPrasad/beacon}

if git -C "$BEACON_ROOT" rev-parse --verify HEAD >/dev/null 2>&1; then
  SHA=$(git -C "$BEACON_ROOT" rev-parse HEAD)
  DEFAULT_TAG=sha-$SHA
else
  SHA=unknown
  DEFAULT_TAG=local-$(date -u +%Y%m%d%H%M%S)
fi
TAG=${TAG:-$DEFAULT_TAG}

GH_TOKEN_VALUE=$(gh auth token) || die "gh auth token failed (gh auth login)"

if [ "$BUILD" = yes ]; then
  docker info >/dev/null 2>&1 || die "Docker is not running"
  gh auth status 2>&1 | grep -q 'write:packages' ||
    die "gh token lacks write:packages: gh auth refresh -h github.com -s write:packages,read:packages"
  printf '%s' "$GH_TOKEN_VALUE" | docker login ghcr.io -u "$OWNER" --password-stdin >/dev/null
  for app in api worker; do
    info "building $REGISTRY/beacon-$app:$TAG (linux/arm64)"
    docker buildx build "$BEACON_ROOT" \
      --file "$BEACON_ROOT/apps/$app/Dockerfile" \
      --platform linux/arm64 \
      --tag "$REGISTRY/beacon-$app:$TAG" \
      --tag "$REGISTRY/beacon-$app:latest" \
      --label "org.opencontainers.image.source=$SOURCE_URL" \
      --label "org.opencontainers.image.revision=$SHA" \
      --push
  done
fi

# Bundle (0700 temp dir; env file 0600; removed on exit).
BUNDLE=$(mktemp -d "${TMPDIR:-/tmp}/beacon-deploy.XXXXXX")
chmod 700 "$BUNDLE"
trap 'rm -rf "$BUNDLE"' EXIT
cp "$BEACON_ROOT/infra/compose/docker-compose.prod.yml" "$BEACON_ROOT/infra/compose/Caddyfile" \
  "$BEACON_ROOT/infra/compose/deploy.sh" "$BUNDLE/"
(umask 077 && compose_prod_env >"$BUNDLE/env")

info "uploading bundle to $APP_PUBLIC_IP:/opt/beacon/incoming"
kscp "$BUNDLE/docker-compose.prod.yml" "$BUNDLE/Caddyfile" "$BUNDLE/deploy.sh" "$BUNDLE/env" \
  "ubuntu@$APP_PUBLIC_IP:/opt/beacon/incoming/"

info "deploying $TAG"
# The registry token travels on stdin, not in the remote command line.
printf '%s\n' "$GH_TOKEN_VALUE" | kssh "$APP_PUBLIC_IP" \
  "IFS= read -r GHCR_TOKEN; export GHCR_TOKEN GHCR_USER=$OWNER; bash /opt/beacon/incoming/deploy.sh '$TAG'"

curl -fsS -m 10 "${API_URL:-https://api.beacon.spacesdrive.cc}/healthz" >/dev/null &&
  info "public healthz OK" || die "public healthz failed"
