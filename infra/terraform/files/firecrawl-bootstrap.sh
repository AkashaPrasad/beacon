#!/usr/bin/env bash
# First-boot bootstrap of the self-hosted Firecrawl cold standby.
# Log: /var/log/beacon-bootstrap.log   Marker: /var/lib/beacon/bootstrap.done
#
# Layout:
#   /opt/firecrawl/src                 shallow clone of firecrawl at $FIRECRAWL_GIT_REF
#   /opt/firecrawl/docker-compose.yaml infra/compose/firecrawl/docker-compose.yaml
#   /opt/firecrawl/.env                rendered from firecrawl.env.template (0600)
#   /etc/systemd/system/firecrawl.service  runs `docker compose up -d` on every boot
set -euo pipefail

# shellcheck source=common.sh
. /usr/local/lib/beacon/common.sh
# shellcheck disable=SC1091
. /etc/beacon/bootstrap.env

FC_DIR=/opt/firecrawl
STAGE=/etc/beacon/firecrawl

log "firecrawl standby bootstrap starting (ref ${FIRECRAWL_GIT_REF}, image ${FIRECRAWL_IMAGE_TAG})"
setup_swap "${SWAP_MB:-2048}"
setup_sysctl
install_base_packages
configure_unattended_upgrades
configure_fail2ban
harden_sshd
install_docker

install -d -m 0755 "$FC_DIR"
if [ ! -d "$FC_DIR/src/.git" ]; then
  log "cloning firecrawl ${FIRECRAWL_GIT_REF} (shallow)"
  retry 5 15 git clone --depth 1 --branch "$FIRECRAWL_GIT_REF" \
    https://github.com/firecrawl/firecrawl.git "$FC_DIR/src"
fi

install -m 0644 "$STAGE/docker-compose.yaml" "$FC_DIR/docker-compose.yaml"

if [ ! -f "$FC_DIR/.env" ]; then
  log "rendering $FC_DIR/.env (random POSTGRES_PASSWORD generated on this host)"
  pg_password=$(openssl rand -hex 24)
  umask 077
  sed -e "s|__POSTGRES_PASSWORD__|${pg_password}|" \
    -e "s|__FIRECRAWL_IMAGE_TAG__|${FIRECRAWL_IMAGE_TAG}|" \
    "$STAGE/firecrawl.env.template" >"$FC_DIR/.env"
  umask 022
  unset pg_password
fi
chmod 600 "$FC_DIR/.env"

install -m 0644 "$STAGE/firecrawl.service" /etc/systemd/system/firecrawl.service
systemctl daemon-reload

cd "$FC_DIR"
log "pulling images"
retry 3 30 docker compose pull --ignore-buildable
log "building playwright-service + nuq-postgres from the pinned source (first boot only)"
retry 2 30 docker compose build

log "enabling + starting firecrawl.service"
systemctl enable firecrawl.service >/dev/null 2>&1
systemctl start firecrawl.service

log "waiting for http://localhost:3002/v0/health/readiness"
ready=no
for _ in $(seq 1 90); do
  if curl -fsS -m 5 http://localhost:3002/v0/health/readiness >/dev/null 2>&1; then
    ready=yes
    break
  fi
  sleep 10
done

if [ "$ready" = yes ]; then
  mark_done "firecrawl ready"
else
  docker compose ps --all || true
  mark_done "firecrawl NOT ready (see: docker compose -f $FC_DIR/docker-compose.yaml logs)"
fi
