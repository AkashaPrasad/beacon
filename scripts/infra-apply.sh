#!/usr/bin/env bash
# One-shot infrastructure bring-up (run by the owner/orchestrator, not by CI):
#
#   1. terraform.tfvars from secrets.env + current IP        (scripts/infra-tfvars.sh)
#   2. terraform init + apply                                 (prompts unless --yes)
#   3. outputs -> secrets.env: FIRECRAWL_INSTANCE_ID, FIRECRAWL_SELF_HOSTED_URL,
#      APP_PUBLIC_IP, APP_INSTANCE_ID, APP_SG_ID, AWS_DEPLOY_ROLE_ARN
#   4. Cloudflare DNS + Pages + SSL check                     (scripts/cloudflare-setup.sh)
#   5. app box: wait for SSH + cloud-init, verify docker/compose/swap/fail2ban
#   6. standby: wait for first-boot bootstrap, verify a real /v1/scrape from the app box
#   7. stop the standby (cold standby from here on; the worker starts it on demand)
#
#   scripts/infra-apply.sh [--yes] [--skip-cloudflare] [--keep-standby-running]
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

AUTO=""
SKIP_CF=no
KEEP_STANDBY=no
for a in "$@"; do
  case $a in
    --yes) AUTO=yes ;;
    --skip-cloudflare) SKIP_CF=yes ;;
    --keep-standby-running) KEEP_STANDBY=yes ;;
    *) die "unknown flag $a" ;;
  esac
done

S=$BEACON_ROOT/scripts
load_secrets
require_vars AWS_PROFILE AWS_REGION SSH_PRIVATE_KEY_PATH
command -v jq >/dev/null || die "jq is required"
_ssh_key >/dev/null

# ── 1-2. Terraform ────────────────────────────────────────────────────────
"$S/infra-tfvars.sh"
tf init -input=false >/dev/null
tf validate
if [ -n "$AUTO" ]; then
  tf apply -input=false -auto-approve
else
  tf apply # interactive: shows the plan and asks for "yes"
fi

trap 'echo "WARNING: a step failed after apply. The Firecrawl standby may still be running (billed while running): scripts/firecrawl-standby.sh status | stop" >&2' ERR

# ── 3. Outputs -> secrets.env ─────────────────────────────────────────────
OUT=$(tf output -json)
o() { jq -er --arg k "$1" '.[$k].value' <<<"$OUT"; }
set_secret_var FIRECRAWL_INSTANCE_ID "$(o firecrawl_instance_id)"
set_secret_var FIRECRAWL_SELF_HOSTED_URL "$(o firecrawl_self_hosted_url)"
set_secret_var APP_PUBLIC_IP "$(o app_public_ip)"
set_secret_var APP_INSTANCE_ID "$(o app_instance_id)"
set_secret_var APP_SG_ID "$(o app_security_group_id)"
set_secret_var AWS_DEPLOY_ROLE_ARN "$(o github_deploy_role_arn)"
info "secrets.env updated: FIRECRAWL_INSTANCE_ID FIRECRAWL_SELF_HOSTED_URL APP_PUBLIC_IP APP_INSTANCE_ID APP_SG_ID AWS_DEPLOY_ROLE_ARN"
info "app box $APP_PUBLIC_IP ($APP_INSTANCE_ID); standby $FIRECRAWL_INSTANCE_ID at $FIRECRAWL_SELF_HOSTED_URL"

# ── 4. Cloudflare ─────────────────────────────────────────────────────────
if [ "$SKIP_CF" = no ]; then
  "$S/cloudflare-setup.sh"
fi

# ── 5. App box ────────────────────────────────────────────────────────────
info "waiting for SSH on the app box"
wait_for_ssh "$APP_PUBLIC_IP" 60
info "waiting for cloud-init on the app box"
kssh "$APP_PUBLIC_IP" 'sudo cloud-init status --wait >/dev/null; cat /var/lib/beacon/bootstrap.done'
kssh "$APP_PUBLIC_IP" 'set -e
  docker version --format "docker {{.Server.Version}}"
  docker compose version
  swapon --show=NAME,SIZE --noheadings
  printf "swappiness=%s\n" "$(cat /proc/sys/vm/swappiness)"
  systemctl is-active fail2ban unattended-upgrades docker | paste -sd" " -
  test -d /opt/beacon && echo "/opt/beacon ok"
  TOKEN=$(curl -fsS -m 3 -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  curl -fsS -m 3 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/info | jq -r ".InstanceProfileArn" | sed -E "s/[0-9]{12}/<acct>/"'
info "app box verified"

# ── 6. Firecrawl standby first boot ───────────────────────────────────────
FC_PUBLIC=$(aws --profile "$AWS_PROFILE" --region "$AWS_REGION" ec2 describe-instances \
  --instance-ids "$FIRECRAWL_INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
info "waiting for SSH on the standby ($FC_PUBLIC)"
wait_for_ssh "$FC_PUBLIC" 60
info "waiting for the standby bootstrap (docker install + image pull + playwright build: ~15-30 min)"
kssh "$FC_PUBLIC" 'sudo cloud-init status --wait >/dev/null || true; cat /var/lib/beacon/bootstrap.done; systemctl is-enabled firecrawl.service; sudo docker compose -f /opt/firecrawl/docker-compose.yaml ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"'
"$S/firecrawl-standby.sh" wait-ready 900

# ── 7. Cold standby ───────────────────────────────────────────────────────
if [ "$KEEP_STANDBY" = no ]; then
  info "stopping the standby (it stays stopped until the worker needs it)"
  "$S/firecrawl-standby.sh" stop
fi

cat >&2 <<EOF

==> Infrastructure is up.
    API origin   : $APP_PUBLIC_IP   ($(o ssh_command))
    Standby      : $FIRECRAWL_INSTANCE_ID ($(if [ "$KEEP_STANDBY" = no ]; then echo stopped; else echo running; fi)) -> $FIRECRAWL_SELF_HOSTED_URL
Next:
    1. Atlas Network Access: add $APP_PUBLIC_IP/32           (docs/INFRA.md, owner step)
    2. scripts/gh-secrets.sh                                  (GitHub secrets incl. PROD_ENV)
    3. gh workflow run deploy-api.yml && gh workflow run deploy-web.yml
       (or scripts/deploy-api-local.sh from this laptop)
    4. make the two GHCR packages public after the first image push (docs/INFRA.md)
EOF
