#!/usr/bin/env bash
# First-boot bootstrap of the Beacon app box (run once by cloud-init).
# Log: /var/log/beacon-bootstrap.log   Marker: /var/lib/beacon/bootstrap.done
set -euo pipefail

# shellcheck source=common.sh
. /usr/local/lib/beacon/common.sh
# shellcheck disable=SC1091
. /etc/beacon/bootstrap.env

log "app bootstrap starting"
setup_swap "${SWAP_MB:-1024}"
setup_sysctl
install_base_packages
configure_unattended_upgrades
configure_fail2ban
harden_sshd
install_docker

# Deploy target. /opt/beacon/.env (runtime secrets) is written by every
# deploy (deploy-api.yml or scripts/deploy-api-local.sh), never by Terraform.
install -d -o ubuntu -g ubuntu -m 0750 /opt/beacon
install -d -o ubuntu -g ubuntu -m 0700 /opt/beacon/incoming
install -m 0755 /usr/local/lib/beacon/kc /usr/local/bin/kc

mark_done "app ready"
