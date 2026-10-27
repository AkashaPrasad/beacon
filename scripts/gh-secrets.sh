#!/usr/bin/env bash
# Sets every GitHub Actions secret the workflows need, from secrets.env.
# Values go to `gh secret set` on stdin (never argv, never printed).
#
#   scripts/gh-secrets.sh            set all secrets on $GITHUB_REPO
#   scripts/gh-secrets.sh --list     print the secret NAMES that would be set
#
# Re-run after scripts/infra-apply.sh (new IP / instance IDs) and after rotating any key.
#
#   deploy-web.yml : CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID VITE_API_URL
#                    VITE_GOOGLE_CLIENT_ID VITE_VAPID_PUBLIC_KEY
#   deploy-api.yml : SSH_PRIVATE_KEY APP_PUBLIC_IP PROD_ENV AWS_DEPLOY_ROLE_ARN APP_SG_ID
#                    AWS_REGION [GHCR_READ_TOKEN]
#
# CLOUDFLARE_PAGES_DEPLOY_TOKEN in secrets.env, if present, is used instead of
# CLOUDFLARE_API_TOKEN for CI: a token scoped to "Account / Cloudflare Pages: Edit" only.
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

LIST=no
[ "${1:-}" = "--list" ] && LIST=yes

load_secrets
require_vars GITHUB_REPO CLOUDFLARE_ACCOUNT_ID API_URL GOOGLE_CLIENT_ID VAPID_PUBLIC_KEY \
  APP_PUBLIC_IP AWS_REGION SSH_PRIVATE_KEY_PATH
CF_TOKEN_VAR=CLOUDFLARE_API_TOKEN
[ -n "${CLOUDFLARE_PAGES_DEPLOY_TOKEN:-}" ] && CF_TOKEN_VAR=CLOUDFLARE_PAGES_DEPLOY_TOKEN
require_vars "$CF_TOKEN_VAR"

if [ "$LIST" = no ]; then
  command -v gh >/dev/null || die "gh CLI is required"
  gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
fi

put() { # put NAME  (value on stdin)
  if [ "$LIST" = yes ]; then
    cat >/dev/null
    printf '  %s\n' "$1"
  else
    gh secret set "$1" --repo "$GITHUB_REPO" >/dev/null
    printf '  set %s\n' "$1" >&2
  fi
}
putv() { printf '%s' "${!2}" | put "$1"; } # putv SECRET_NAME VAR_NAME

info "GitHub secrets for $GITHUB_REPO"

# deploy-web
[ "$CF_TOKEN_VAR" = CLOUDFLARE_API_TOKEN ] &&
  info "note: CI gets the broad CLOUDFLARE_API_TOKEN; add CLOUDFLARE_PAGES_DEPLOY_TOKEN (Pages: Edit only) to secrets.env to narrow it"
putv CLOUDFLARE_API_TOKEN "$CF_TOKEN_VAR"
putv CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ACCOUNT_ID
putv VITE_API_URL API_URL
putv VITE_GOOGLE_CLIENT_ID GOOGLE_CLIENT_ID
putv VITE_VAPID_PUBLIC_KEY VAPID_PUBLIC_KEY

# deploy-api
put SSH_PRIVATE_KEY <"$(_ssh_key)"
putv APP_PUBLIC_IP APP_PUBLIC_IP
putv AWS_REGION AWS_REGION
if [ -n "${AWS_DEPLOY_ROLE_ARN:-}" ] && [ -n "${APP_SG_ID:-}" ]; then
  putv AWS_DEPLOY_ROLE_ARN AWS_DEPLOY_ROLE_ARN
  putv APP_SG_ID APP_SG_ID
else
  info "warning: AWS_DEPLOY_ROLE_ARN/APP_SG_ID empty: deploy-api.yml cannot open port 22 for the runner"
fi
[ -n "${GHCR_READ_TOKEN:-}" ] && putv GHCR_READ_TOKEN GHCR_READ_TOKEN
compose_prod_env | put PROD_ENV

info "done"
