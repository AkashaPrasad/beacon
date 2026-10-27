#!/usr/bin/env bash
# Prints this machine's public IPv4 as a /32 CIDR (used for admin_cidr: SSH allow-list).
set -euo pipefail

re='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
for url in https://checkip.amazonaws.com https://api.ipify.org https://ipv4.icanhazip.com; do
  ip=$(curl -4 -fsS -m 8 "$url" 2>/dev/null | tr -d '[:space:]') || continue
  if [[ $ip =~ $re ]]; then
    printf '%s/32\n' "$ip"
    exit 0
  fi
done
echo "error: could not determine public IPv4" >&2
exit 1
