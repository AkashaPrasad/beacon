# shellcheck shell=bash
# Shared helpers for Beacon infra scripts (bash 3.2 compatible: macOS /bin/bash).
# Source it; nothing here prints a secret value.
#
#   . "$(dirname "$0")/lib/env.sh"
#   load_secrets            # exports every KEY=VALUE from secrets.env
#   require_vars A B C      # fails (names only) if any is empty
#   set_secret_var KEY VAL  # replaces/appends one line in secrets.env in place
#   compose_prod_env        # prints the /opt/beacon/.env body (pipe it, don't echo it)
#   kssh HOST CMD... / kscp SRC... DEST   ssh/scp with SSH_PRIVATE_KEY_PATH
#
# Why not plain `set -a; source secrets.env; set +a`: an unquoted value containing
# "&" (MONGODB_URI's ?retryWrites=true&w=majority) is a shell control operator, so
# bash silently drops that variable and zsh refuses to parse the file. This parser
# reads KEY=VALUE lines literally (quotes optional, " # comment" stripped from bare
# values), so it works whether or not the owner quotes the file.

BEACON_ROOT=${BEACON_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
SECRETS_FILE=${SECRETS_FILE:-$BEACON_ROOT/secrets.env}
TF_DIR=${TF_DIR:-$BEACON_ROOT/infra/terraform}

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*" >&2; }

_RE_LINE='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$'
_RE_DQ='^"(.*)"[[:space:]]*(#.*)?$'
_RE_SQ="^'(.*)'[[:space:]]*(#.*)?\$"
_RE_KEY='^[A-Za-z_][A-Za-z0-9_]*$'

load_secrets() {
  [ -f "$SECRETS_FILE" ] || die "missing $SECRETS_FILE"
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    [[ $line =~ $_RE_LINE ]] || continue
    key=${BASH_REMATCH[2]}
    val=${BASH_REMATCH[3]}
    if [[ $val =~ $_RE_DQ ]]; then
      val=${BASH_REMATCH[1]}
    elif [[ $val =~ $_RE_SQ ]]; then
      val=${BASH_REMATCH[1]}
    else
      val=$(printf '%s' "$val" | sed -E 's/[[:space:]]+#.*$//; s/^#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//')
    fi
    printf -v "$key" '%s' "$val"
    # shellcheck disable=SC2163
    export "$key"
  done <"$SECRETS_FILE"
}

require_vars() {
  local missing="" v
  for v in "$@"; do
    [ -n "${!v:-}" ] || missing="$missing $v"
  done
  [ -z "$missing" ] || die "empty or missing in secrets.env:$missing"
}

# Replace the whole `KEY=...` line (including any placeholder comment) or append it.
# Rewrites the file in place so its 0600 mode and inode are preserved.
set_secret_var() {
  local key=$1 val=$2 tmp
  [[ $key =~ $_RE_KEY ]] || die "bad key $key"
  case $val in *$'\n'*) die "multi-line value for $key" ;; esac
  tmp=$(mktemp "${TMPDIR:-/tmp}/beacon-secrets.XXXXXX")
  chmod 600 "$tmp"
  KEY="$key" VAL="$val" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
    $0 ~ ("^[ \t]*(export[ \t]+)?" k "=") { if (!done) { print k "=" v; done = 1 }; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$SECRETS_FILE" >"$tmp"
  cat "$tmp" >"$SECRETS_FILE"
  rm -f "$tmp"
  printf -v "$key" '%s' "$val"
  # shellcheck disable=SC2163
  export "$key"
}

# Quote a value for a docker compose env_file: bare when safe, otherwise single-quoted
# (literal; compose does no ${} interpolation inside single quotes).
_envfile_value() {
  local v=$1
  case $v in
    *"'"*) die "a value contains a single quote; it cannot be written safely to an env_file" ;;
    *[[:space:]]* | *'#'* | *'$'* | *'"'* | *'\'* | *'`'*) printf "'%s'" "$v" ;;
    *) printf '%s' "$v" ;;
  esac
}

# Runtime variables for /opt/beacon/.env (shared by api + worker).
# Keep in sync with docs/INFRA.md, section "Server env file".
PROD_ENV_KEYS="MONGODB_URI MONGODB_DB REDIS_URL
GOOGLE_CLIENT_ID JWT_SECRET ENCRYPTION_KEY
LLM_PROVIDER LLM_BASE_URL LLM_API_KEY LLM_MODEL
EMBEDDING_PROVIDER EMBEDDING_MODEL
FIRECRAWL_API_KEY FIRECRAWL_DAILY_CREDIT_CAP FIRECRAWL_SELF_HOSTED_URL FIRECRAWL_INSTANCE_ID
FIRECRAWL_STANDBY_IDLE_MINUTES
VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT
WEB_URL API_URL AWS_REGION NODE_ENV VECTOR_SEARCH"
PROD_ENV_OPTIONAL_KEYS="SENTRY_DSN"

compose_prod_env() {
  NODE_ENV=production
  VECTOR_SEARCH=${VECTOR_SEARCH:-atlas}
  FIRECRAWL_STANDBY_IDLE_MINUTES=${FIRECRAWL_STANDBY_IDLE_MINUTES:-20}
  export NODE_ENV VECTOR_SEARCH FIRECRAWL_STANDBY_IDLE_MINUTES
  # shellcheck disable=SC2086
  require_vars $PROD_ENV_KEYS
  local k
  printf '# /opt/beacon/.env, generated from secrets.env by scripts/lib/env.sh. Do not edit on the box.\n'
  for k in $PROD_ENV_KEYS; do
    printf '%s=%s\n' "$k" "$(_envfile_value "${!k}")"
  done
  for k in $PROD_ENV_OPTIONAL_KEYS; do
    if [ -n "${!k:-}" ]; then printf '%s=%s\n' "$k" "$(_envfile_value "${!k}")"; fi
  done
}

tf() { terraform -chdir="$TF_DIR" "$@"; }

_ssh_key() {
  local key=${SSH_PRIVATE_KEY_PATH:-$HOME/.ssh/id_ed25519}
  case $key in "~/"*) key="$HOME/${key#\~/}" ;; esac
  [ -f "$key" ] || die "SSH private key not found (SSH_PRIVATE_KEY_PATH)"
  printf '%s' "$key"
}

kssh() {
  local host=$1
  shift
  ssh -i "$(_ssh_key)" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
    -o ServerAliveInterval=15 -o BatchMode=yes "ubuntu@$host" "$@"
}

kscp() {
  scp -q -i "$(_ssh_key)" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
    -o BatchMode=yes "$@"
}

# Poll until `kssh HOST true` succeeds (default 10 min).
wait_for_ssh() {
  local host=$1 tries=${2:-60} i
  for i in $(seq 1 "$tries"); do
    if kssh "$host" true 2>/dev/null; then return 0; fi
    sleep 10
  done
  die "SSH to $host not reachable after $((tries * 10))s"
}
