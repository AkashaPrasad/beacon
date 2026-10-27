# shellcheck shell=bash
# Shared first-boot helpers for Beacon EC2 hosts (Ubuntu 24.04 arm64).
# Installed to /usr/local/lib/beacon/common.sh by cloud-init and sourced by
# /usr/local/sbin/beacon-bootstrap.sh. Every function is idempotent.

export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -q -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

log() { printf '[beacon-bootstrap %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

retry() {
  local attempts=$1 delay=$2 n=1
  shift 2
  until "$@"; do
    if [ "$n" -ge "$attempts" ]; then
      log "command failed after $n attempts: $*"
      return 1
    fi
    log "retry $n/$attempts in ${delay}s: $*"
    sleep "$delay"
    n=$((n + 1))
  done
}

setup_swap() {
  local size_mb=$1
  if swapon --show=NAME --noheadings | grep -qx /swapfile; then
    log "swapfile already active"
    return 0
  fi
  log "creating ${size_mb} MB swapfile"
  fallocate -l "${size_mb}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$size_mb" status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
}

setup_sysctl() {
  cat >/etc/sysctl.d/99-beacon.conf <<'EOF'
# Beacon: prefer RAM, use swap only as an OOM safety net.
vm.swappiness = 10
vm.vfs_cache_pressure = 50
# Redis recommends overcommit so background saves never fail.
vm.overcommit_memory = 1
EOF
  sysctl --system >/dev/null
}

install_base_packages() {
  log "installing base packages"
  retry 5 10 apt-get update -q
  retry 3 15 apt-get install "${APT_OPTS[@]}" \
    ca-certificates curl gnupg jq git unattended-upgrades fail2ban python3-systemd "$@"
}

configure_unattended_upgrades() {
  log "enabling unattended-upgrades (security updates, no automatic reboot)"
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  systemctl enable --now unattended-upgrades.service >/dev/null 2>&1 || true
}

configure_fail2ban() {
  log "configuring fail2ban (sshd via systemd journal)"
  mkdir -p /etc/fail2ban/jail.d
  cat >/etc/fail2ban/jail.d/beacon-sshd.local <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
  systemctl enable fail2ban >/dev/null 2>&1 || true
  # Non-fatal: a fail2ban problem must not stop Docker from being installed.
  # scripts/infra-apply.sh prints `systemctl is-active fail2ban` afterwards.
  systemctl restart fail2ban || log "WARNING: fail2ban failed to start (journalctl -u fail2ban)"
}

harden_sshd() {
  log "sshd: key-only auth"
  # sshd keeps the FIRST value it reads and includes drop-ins in lexical
  # order, so 10- wins over 50-cloud-init.conf / 60-cloudimg-settings.conf.
  cat >/etc/ssh/sshd_config.d/10-beacon.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  systemctl reload ssh >/dev/null 2>&1 || systemctl reload sshd >/dev/null 2>&1 || true
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "docker + compose already installed"
  else
    log "installing Docker Engine + compose plugin from download.docker.com"
    install -m 0755 -d /etc/apt/keyrings
    retry 5 10 curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck disable=SC1091
    . /etc/os-release
    cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    retry 5 10 apt-get update -q
    retry 3 15 apt-get install "${APT_OPTS[@]}" \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  # Compose networks come from 10.201.0.0/16: Docker's default pools include
  # 172.31.0.0/16, which is the default VPC's CIDR. A bridge there would swallow
  # traffic to the standby's private IP.
  mkdir -p /etc/docker
  if [ ! -s /etc/docker/daemon.json ]; then
    cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "default-address-pools": [{ "base": "10.201.0.0/16", "size": 24 }]
}
EOF
  fi
  systemctl enable docker >/dev/null 2>&1
  systemctl restart docker
  usermod -aG docker ubuntu
  docker version --format 'docker {{.Server.Version}}' && docker compose version
}

mark_done() {
  mkdir -p /var/lib/beacon
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >/var/lib/beacon/bootstrap.done
  log "bootstrap finished: $1"
}
