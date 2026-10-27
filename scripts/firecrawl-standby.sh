#!/usr/bin/env bash
# Operate the self-hosted Firecrawl cold standby from this laptop (AWS CLI profile).
#
#   scripts/firecrawl-standby.sh status               state, private/public IP
#   scripts/firecrawl-standby.sh start                start + wait until "running"
#   scripts/firecrawl-standby.sh stop                 stop + wait until "stopped"
#   scripts/firecrawl-standby.sh wait-ready [secs]    poll readiness, then one real /v1/scrape
#   scripts/firecrawl-standby.sh ssh [cmd]            SSH to the standby (needs it running)
#
# wait-ready checks from the APP BOX (ssh to APP_PUBLIC_IP, curl the private IP), which
# exercises the same path and SG rule the worker uses. Without APP_PUBLIC_IP it falls
# back to SSH on the standby itself and curls localhost.
#
# In production the worker does start/stop by itself (instance role); this script is for
# first-boot verification, debugging and manual failover drills.
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

load_secrets
require_vars AWS_PROFILE AWS_REGION
if [ -z "${FIRECRAWL_INSTANCE_ID:-}" ]; then
  FIRECRAWL_INSTANCE_ID=$(tf output -raw firecrawl_instance_id 2>/dev/null || true)
fi
[ -n "${FIRECRAWL_INSTANCE_ID:-}" ] || die "FIRECRAWL_INSTANCE_ID unknown (run scripts/infra-apply.sh first)"
ID=$FIRECRAWL_INSTANCE_ID

aws_() { aws --profile "$AWS_PROFILE" --region "$AWS_REGION" "$@"; }

describe() {
  aws_ ec2 describe-instances --instance-ids "$ID" \
    --query 'Reservations[0].Instances[0].[State.Name, PrivateIpAddress, PublicIpAddress || `-`]' \
    --output text
}

state() { describe | awk '{print $1}'; }
private_ip() { describe | awk '{print $2}'; }
public_ip() { describe | awk '{print $3}'; }

cmd_status() {
  local s p q
  read -r s p q <<<"$(describe)"
  printf 'instance  %s\nstate     %s\nprivate   %s  (FIRECRAWL_SELF_HOSTED_URL=http://%s:3002)\npublic    %s  (changes on every start)\n' \
    "$ID" "$s" "$p" "$p" "$q"
}

cmd_start() {
  case $(state) in
    running) info "already running" ;;
    stopping)
      info "waiting for stop to finish first"
      aws_ ec2 wait instance-stopped --instance-ids "$ID"
      aws_ ec2 start-instances --instance-ids "$ID" >/dev/null
      ;;
    *) aws_ ec2 start-instances --instance-ids "$ID" >/dev/null ;;
  esac
  aws_ ec2 wait instance-running --instance-ids "$ID"
  info "running: $(describe)"
}

cmd_stop() {
  case $(state) in
    stopped) info "already stopped" ;;
    *)
      aws_ ec2 stop-instances --instance-ids "$ID" >/dev/null
      aws_ ec2 wait instance-stopped --instance-ids "$ID"
      info "stopped"
      ;;
  esac
}

# Remote probe script: readiness loop, then one functional scrape (markdown only).
probe_script() {
  local base=$1 timeout=$2
  cat <<EOF
set -e
end=\$((\$(date +%s) + $timeout))
until curl -fsS -m 5 $base/v0/health/readiness >/dev/null 2>&1; do
  [ \$(date +%s) -lt \$end ] || { echo "readiness timeout ($base)"; exit 1; }
  sleep 5
done
echo "readiness OK ($base)"
out=\$(curl -sS -m 90 -X POST $base/v1/scrape -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","formats":["markdown"],"timeout":60000}')
echo "\$out" | jq -e '.success == true and ((.data.markdown // "") | length > 0)' >/dev/null \
  || { echo "scrape FAILED: \$(echo "\$out" | head -c 400)"; exit 1; }
echo "scrape OK: /v1/scrape example.com -> \$(echo "\$out" | jq -r '.data.markdown | length') chars of markdown"
EOF
}

cmd_wait_ready() {
  local timeout=${1:-900} s
  s=$(state)
  [ "$s" = running ] || die "standby is $s; run: $0 start"
  if [ -n "${APP_PUBLIC_IP:-}" ]; then
    info "probing http://$(private_ip):3002 from the app box ($APP_PUBLIC_IP)"
    kssh "$APP_PUBLIC_IP" "bash -s" <<<"$(probe_script "http://$(private_ip):3002" "$timeout")"
  else
    info "APP_PUBLIC_IP unset; probing localhost:3002 on the standby itself"
    wait_for_ssh "$(public_ip)" 30
    kssh "$(public_ip)" "bash -s" <<<"$(probe_script "http://localhost:3002" "$timeout")"
  fi
}

cmd_ssh() {
  [ "$(state)" = running ] || die "standby is not running"
  kssh "$(public_ip)" "$@"
}

case ${1:-status} in
  status) cmd_status ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  wait-ready) cmd_wait_ready "${2:-900}" ;;
  ssh) shift; cmd_ssh "$@" ;;
  *) die "usage: $0 status|start|stop|wait-ready [secs]|ssh [cmd]" ;;
esac
