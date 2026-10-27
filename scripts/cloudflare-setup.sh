#!/usr/bin/env bash
# Idempotent Cloudflare setup for Beacon (curl + jq, CLOUDFLARE_* from secrets.env).
#
#   scripts/cloudflare-setup.sh --check   read-only: token, zone, SSL mode, records, Pages project
#   scripts/cloudflare-setup.sh           create/update everything below (needs APP_PUBLIC_IP)
#
#   1. DNS   A     $API_HOST -> $APP_PUBLIC_IP   proxied
#   2. Pages project $CLOUDFLARE_PAGES_PROJECT (production branch main, Direct Upload)
#      + custom domain $WEB_HOST, + CNAME $WEB_HOST -> <project>.pages.dev proxied
#   3. Zone SSL mode: only if it is "off" or "flexible", set it to "strict".
#
# The token is passed to curl through a 0600 header file, never on the command line.
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

MODE=apply
[ "${1:-}" = "--check" ] && MODE=check

load_secrets
require_vars CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID API_HOST WEB_HOST
PROJECT=${CLOUDFLARE_PAGES_PROJECT:-beacon}
[ "$MODE" = check ] || require_vars APP_PUBLIC_IP
command -v jq >/dev/null || die "jq is required"

CF=https://api.cloudflare.com/client/v4
HDR=$(mktemp "${TMPDIR:-/tmp}/beacon-cf.XXXXXX")
chmod 600 "$HDR"
trap 'rm -f "$HDR"' EXIT
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$CLOUDFLARE_API_TOKEN" >"$HDR"

# cf METHOD PATH [JSON]  -> prints the response body; fails on success=false (except 404 lookups)
cf() {
  local method=$1 path=$2 data=${3:-} body
  if [ -n "$data" ]; then
    body=$(curl -sS -X "$method" -H @"$HDR" --data "$data" "$CF$path")
  else
    body=$(curl -sS -X "$method" -H @"$HDR" "$CF$path")
  fi
  printf '%s' "$body"
}
ok() { jq -e '.success == true' >/dev/null 2>&1 <<<"$1"; }
errs() { jq -r '[.errors[]? | "\(.code): \(.message)"] | join("; ")' <<<"$1"; }

# ── 0. Token + zone ───────────────────────────────────────────────────────
r=$(cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify")
if ok "$r"; then
  info "token: $(jq -r .result.status <<<"$r") (account-scoped)"
else
  r=$(cf GET "/user/tokens/verify")
  ok "$r" || die "token verify failed: $(errs "$r")"
  info "token: $(jq -r .result.status <<<"$r") (user-scoped)"
fi
r=$(cf GET "/zones/$CLOUDFLARE_ZONE_ID")
ok "$r" || die "zone read failed: $(errs "$r")"
ZONE_NAME=$(jq -r .result.name <<<"$r")
info "zone: $ZONE_NAME ($(jq -r .result.status <<<"$r"), plan $(jq -r .result.plan.name <<<"$r"))"
case $API_HOST in *."$ZONE_NAME") ;; *) die "API_HOST is not inside zone $ZONE_NAME" ;; esac
case $WEB_HOST in *."$ZONE_NAME") ;; *) die "WEB_HOST is not inside zone $ZONE_NAME" ;; esac

# ── 1. A api.<domain> -> EIP (proxied) ────────────────────────────────────
records_for() { cf GET "/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$1&per_page=100"; }

r=$(records_for "$API_HOST")
ok "$r" || die "DNS list failed: $(errs "$r")"
conflict=$(jq -r '[.result[] | select(.type != "A")] | map(.type) | join(",")' <<<"$r")
[ -z "$conflict" ] || die "$API_HOST already has non-A records ($conflict); remove them first"
a_id=$(jq -r '[.result[] | select(.type == "A")][0].id // empty' <<<"$r")
a_now=$(jq -r '[.result[] | select(.type == "A")][0] | if . then "\(.content) proxied=\(.proxied)" else "none" end' <<<"$r")
info "DNS A $API_HOST: currently $a_now"

if [ "$MODE" = apply ]; then
  payload=$(jq -nc --arg n "$API_HOST" --arg ip "$APP_PUBLIC_IP" \
    '{type:"A", name:$n, content:$ip, proxied:true, ttl:1, comment:"Beacon API (scripts/cloudflare-setup.sh)"}')
  if [ -n "$a_id" ]; then
    r=$(cf PATCH "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$a_id" "$payload")
  else
    r=$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$payload")
  fi
  ok "$r" || die "DNS upsert failed: $(errs "$r")"
  info "DNS A $API_HOST -> $(jq -r .result.content <<<"$r") proxied=$(jq -r .result.proxied <<<"$r")"
fi

# ── 2. Pages project + custom domain + CNAME ──────────────────────────────
r=$(cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT")
if ok "$r"; then
  info "Pages project $PROJECT exists (subdomain $(jq -r .result.subdomain <<<"$r"), branch $(jq -r .result.production_branch <<<"$r"))"
elif [ "$MODE" = apply ]; then
  info "creating Pages project $PROJECT (Direct Upload, production branch main)"
  r=$(cf POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
    "$(jq -nc --arg n "$PROJECT" '{name:$n, production_branch:"main"}')")
  ok "$r" || die "Pages project create failed: $(errs "$r")"
else
  r=$(cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects?per_page=10")
  ok "$r" || die "Pages read failed (token needs Pages): $(errs "$r")"
  info "Pages project $PROJECT does not exist yet (Pages read OK; would be created)"
  r=""
fi
# <project>.pages.dev may be taken globally; Cloudflare then assigns e.g. beacon-abc.pages.dev.
PAGES_SUBDOMAIN=$( [ -n "$r" ] && jq -r '.result.subdomain // empty' <<<"$r" || true)

if [ -n "$PAGES_SUBDOMAIN" ]; then
  r=$(cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains")
  ok "$r" || die "Pages domains read failed: $(errs "$r")"
  dom_status=$(jq -r --arg d "$WEB_HOST" '[.result[] | select(.name == $d)][0].status // empty' <<<"$r")
  if [ -n "$dom_status" ]; then
    info "Pages custom domain $WEB_HOST: $dom_status"
  elif [ "$MODE" = apply ]; then
    r=$(cf POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" \
      "$(jq -nc --arg d "$WEB_HOST" '{name:$d}')")
    ok "$r" || die "adding Pages custom domain failed: $(errs "$r")"
    info "Pages custom domain $WEB_HOST added ($(jq -r .result.status <<<"$r"))"
  else
    info "Pages custom domain $WEB_HOST: not attached (would be added)"
  fi
fi

r=$(records_for "$WEB_HOST")
ok "$r" || die "DNS list failed: $(errs "$r")"
conflict=$(jq -r '[.result[] | select(.type != "CNAME")] | map(.type) | join(",")' <<<"$r")
[ -z "$conflict" ] || die "$WEB_HOST already has non-CNAME records ($conflict); remove them first"
c_id=$(jq -r '[.result[] | select(.type == "CNAME")][0].id // empty' <<<"$r")
c_now=$(jq -r '[.result[] | select(.type == "CNAME")][0] | if . then "\(.content) proxied=\(.proxied)" else "none" end' <<<"$r")
info "DNS CNAME $WEB_HOST: currently $c_now"

if [ "$MODE" = apply ]; then
  [ -n "$PAGES_SUBDOMAIN" ] || die "no Pages subdomain resolved"
  payload=$(jq -nc --arg n "$WEB_HOST" --arg t "$PAGES_SUBDOMAIN" \
    '{type:"CNAME", name:$n, content:$t, proxied:true, ttl:1, comment:"Beacon web on Pages (scripts/cloudflare-setup.sh)"}')
  if [ -n "$c_id" ]; then
    r=$(cf PATCH "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$c_id" "$payload")
  else
    r=$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$payload")
  fi
  ok "$r" || die "CNAME upsert failed: $(errs "$r")"
  info "DNS CNAME $WEB_HOST -> $(jq -r .result.content <<<"$r") proxied=$(jq -r .result.proxied <<<"$r")"
fi

# ── 3. SSL mode (ZONE-WIDE: affects every proxied host in $ZONE_NAME) ─────
r=$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/settings/ssl")
ok "$r" || die "SSL setting read failed: $(errs "$r")"
ssl=$(jq -r .result.value <<<"$r")
info "zone SSL mode: $ssl"
case $ssl in
  off | flexible)
    # Flexible would make Cloudflare talk plain HTTP to Caddy, which redirects to
    # HTTPS -> redirect loop. Strict needs a valid origin cert: Caddy gets one from
    # Let's Encrypt. This changes the whole zone, so other proxied hosts are affected.
    if [ "$MODE" = apply ]; then
      r=$(cf PATCH "/zones/$CLOUDFLARE_ZONE_ID/settings/ssl" '{"value":"strict"}')
      ok "$r" || die "SSL mode update failed: $(errs "$r")"
      info "zone SSL mode set to strict (zone-wide)"
    else
      info "would set zone SSL mode to strict (zone-wide)"
    fi
    ;;
  *) info "SSL mode OK; leaving it unchanged" ;;
esac

r=$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/settings/always_use_https")
ok "$r" && info "always_use_https: $(jq -r .result.value <<<"$r") (ACME HTTP-01 paths are still forwarded to the origin)"

info "cloudflare-setup ($MODE) done"
