#!/usr/bin/env bash
# Beacon security checks (SPEC §8 "Security" row). Never prints a secret value.
#
#   scripts/security-check.sh                    # everything, API at $API_URL (default http://localhost:4000)
#   scripts/security-check.sh --only audit,leaks # a subset: audit leaks secrets headers cors csrf cookies ratelimit auth
#   scripts/security-check.sh --no-rate-limit    # skip the 429 burst (use against prod: it locks your IP out of sign-in for 1 min)
#   scripts/security-check.sh --report out.md    # also write the results table as Markdown
#
# Env: API_URL, WEB_URL (allowed CORS origin; default http://localhost:5173),
#      GOOGLE_ID_TOKEN (optional, a real GIS ID token: checks the Set-Cookie of a real sign-in).
#
# Exit 1 if any check FAILs. WARN never fails the run. SKIP always states why.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
API_URL=${API_URL:-http://localhost:4000}
API_URL=${API_URL%/}
WEB_ORIGIN=${WEB_URL:-http://localhost:5173}
WEB_ORIGIN=${WEB_ORIGIN%/}
EVIL_ORIGIN=https://evil.example
ALLOWLIST="$ROOT/scripts/audit-allowlist.json"
ONLY=""
RATE_LIMIT=1
REPORT=""

while [ $# -gt 0 ]; do
  case $1 in
    --only) ONLY=",$2,"; shift 2 ;;
    --no-rate-limit) RATE_LIMIT=0; shift ;;
    --report) REPORT=$2; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

WORK=$(mktemp -d "${TMPDIR:-/tmp}/beacon-sec.XXXXXX")
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

RESULTS="$WORK/results.tsv"
: >"$RESULTS"
FAILS=0

want() { [ -z "$ONLY" ] || case $ONLY in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
record() { # status check detail
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" >>"$RESULTS"
  case $1 in FAIL) FAILS=$((FAILS + 1)); printf '\033[31mFAIL\033[0m %s: %s\n' "$2" "$3" ;;
    PASS) printf '\033[32mPASS\033[0m %s: %s\n' "$2" "$3" ;;
    WARN) printf '\033[33mWARN\033[0m %s: %s\n' "$2" "$3" ;;
    *) printf 'SKIP %s: %s\n' "$2" "$3" ;; esac
}
section() { printf '\n== %s\n' "$1"; }

# ── 1. Dependency audit ───────────────────────────────────────────────────────
if want audit; then
  section "pnpm audit --prod (fail on high/critical; allowlist scripts/audit-allowlist.json)"
  if (cd "$ROOT" && pnpm audit --prod --json >"$WORK/audit.json" 2>"$WORK/audit.err"); then :; fi
  if [ ! -s "$WORK/audit.json" ]; then
    record WARN audit "pnpm audit produced no JSON ($(head -c 200 "$WORK/audit.err" | tr '\n' ' '))"
  else
    node - "$WORK/audit.json" "$ALLOWLIST" >"$WORK/audit.out" <<'NODE'
const fs = require('node:fs');
const [file, allowFile] = process.argv.slice(2);
let data;
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`ERROR\tunparseable audit JSON: ${e.message}`); process.exit(0); }
if (data.error) { console.log(`ERROR\t${data.error.code ?? ''} ${data.error.summary ?? data.error.message ?? ''}`.trim()); process.exit(0); }
let allow = [];
try { allow = JSON.parse(fs.readFileSync(allowFile, 'utf8')).allow ?? []; } catch { allow = []; }
const today = new Date().toISOString().slice(0, 10);
const active = allow.filter((a) => !a.expires || a.expires >= today);
const advisories = Object.values(data.advisories ?? {});
const blocking = [], allowed = [], minor = [];
for (const a of advisories) {
  const id = a.github_advisory_id ?? String(a.id);
  const hit = active.find((x) => x.id === id || x.id === String(a.id) || (x.module && x.module === a.module_name));
  const line = `${a.severity} ${a.module_name}@${a.vulnerable_versions} ${id}: ${a.title}`;
  if (a.severity === 'high' || a.severity === 'critical') (hit ? allowed : blocking).push(hit ? `${line} (allowlisted: ${hit.reason})` : line);
  else minor.push(line);
}
const counts = data.metadata?.vulnerabilities ?? {};
console.log(`COUNTS\t${['critical', 'high', 'moderate', 'low'].map((k) => `${k} ${counts[k] ?? 0}`).join(', ')}`);
for (const l of blocking) console.log(`BLOCK\t${l}`);
for (const l of allowed) console.log(`ALLOW\t${l}`);
for (const l of minor) console.log(`MINOR\t${l}`);
NODE
    if grep -q '^ERROR' "$WORK/audit.out"; then
      record WARN audit "audit endpoint error: $(grep '^ERROR' "$WORK/audit.out" | cut -f2 | head -c 200)"
    else
      counts=$(grep '^COUNTS' "$WORK/audit.out" | cut -f2)
      nblock=$(grep -c '^BLOCK' "$WORK/audit.out" || true)
      nallow=$(grep -c '^ALLOW' "$WORK/audit.out" || true)
      grep -E '^(BLOCK|ALLOW)' "$WORK/audit.out" | cut -f2 | sed 's/^/    /'
      if [ "$nblock" -gt 0 ]; then record FAIL audit "$nblock high/critical not allowlisted ($counts)"
      else record PASS audit "0 blocking high/critical ($counts; $nallow allowlisted)"; fi
    fi
  fi
fi

# Files that would be committed: tracked + untracked-not-ignored (never secrets.env / info.txt).
committable() {
  (cd "$ROOT" && git ls-files -co --exclude-standard 2>/dev/null) | grep -vE '(^|/)(secrets\.env|info\.txt)$' || true
}

# ── 2. gitleaks ───────────────────────────────────────────────────────────────
if want leaks; then
  section "gitleaks (.gitleaks.toml) over the committable tree and git history"
  if ! command -v gitleaks >/dev/null 2>&1; then
    record WARN gitleaks "gitleaks not installed (brew install gitleaks); CI installs it"
  else
    snap="$WORK/snapshot"
    mkdir -p "$snap"
    committable >"$WORK/files.txt"
    (cd "$ROOT" && rsync -a --files-from="$WORK/files.txt" ./ "$snap/" 2>/dev/null)
    nfiles=$(wc -l <"$WORK/files.txt" | tr -d ' ')
    if gitleaks dir "$snap" --config "$ROOT/.gitleaks.toml" --redact --no-banner --exit-code 1 \
      --report-format json --report-path "$WORK/gitleaks-dir.json" >/dev/null 2>"$WORK/gitleaks.err"; then
      record PASS gitleaks-tree "0 findings in $nfiles committable files"
    else
      n=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).length)}catch{console.log("?")}' "$WORK/gitleaks-dir.json")
      node -e 'try{for(const f of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")))console.log(`    ${f.RuleID} ${f.File.replace(/^.*?\/snapshot\//,"")}:${f.StartLine}`)}catch{}' "$WORK/gitleaks-dir.json" "$snap"
      record FAIL gitleaks-tree "$n finding(s) (values redacted)"
    fi
    if (cd "$ROOT" && git rev-parse --verify HEAD >/dev/null 2>&1); then
      if (cd "$ROOT" && gitleaks git . --config .gitleaks.toml --redact --no-banner --exit-code 1 >/dev/null 2>&1); then
        record PASS gitleaks-history "0 findings in git history"
      else
        record FAIL gitleaks-history "findings in git history (run: gitleaks git . --redact -v)"
      fi
    else
      record SKIP gitleaks-history "no commits yet"
    fi
  fi
fi

# ── 3. secrets.env values anywhere in the tree or in built bundles ────────────
if want secrets; then
  section "secrets.env values must not appear in committable files or apps/*/dist (values never printed)"
  if [ ! -f "$ROOT/secrets.env" ]; then
    record SKIP secrets-in-tree "no secrets.env on this machine (CI has none)"
  else
    # Not credentials: public by design (client ids, public keys, hostnames, model names, sizes).
    PUBLIC_KEYS=" APP_NAME DOMAIN WEB_HOST API_HOST WEB_URL API_URL GITHUB_REPO CLOUDFLARE_PAGES_PROJECT AWS_PROFILE AWS_REGION AWS_INSTANCE_TYPE FIRECRAWL_INSTANCE_TYPE SSH_PUBLIC_KEY SSH_PRIVATE_KEY_PATH MONGODB_DB LLM_PROVIDER LLM_BASE_URL LLM_MODEL EMBEDDING_PROVIDER EMBEDDING_MODEL FIRECRAWL_DAILY_CREDIT_CAP FIRECRAWL_STANDBY_IDLE_MINUTES VAPID_PUBLIC_KEY VAPID_SUBJECT GOOGLE_CLIENT_ID VECTOR_SEARCH NODE_ENV LOG_LEVEL PORT "
    committable >"$WORK/files.txt"
    for d in apps/web/dist apps/api/dist apps/worker/dist packages/shared/dist; do
      [ -d "$ROOT/$d" ] && (cd "$ROOT" && find "$d" -type f) >>"$WORK/files.txt"
    done
    # Run in a subshell so the loaded values never leak into this shell's environment.
    (
      # shellcheck source=lib/env.sh
      . "$ROOT/scripts/lib/env.sh"
      load_secrets >/dev/null 2>&1
      : >"$WORK/patterns" ; chmod 600 "$WORK/patterns"
      : >"$WORK/keys"
      while IFS= read -r line; do
        case $line in ''|'#'*) continue ;; esac
        key=${line%%=*}; key=${key#export }; key=$(printf '%s' "$key" | tr -d '[:space:]')
        printf '%s' "$key" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || continue
        case $PUBLIC_KEYS in *" $key "*) continue ;; esac
        val=${!key:-}
        [ ${#val} -ge 8 ] || continue
        class=secret
        case $key in *_ID|*_IP|*_ARN|*_IDS|*SELF_HOSTED_URL) class=identifier ;; esac
        # Credentials embedded in URIs (mongodb+srv://user:pass@host): scan the password alone too.
        pw=$(printf '%s' "$val" | sed -nE 's#^[a-z+]+://[^:/@]+:([^@]+)@.*#\1#p')
        if [ ${#pw} -ge 6 ]; then printf '%s\n' "$pw" >>"$WORK/patterns"; printf '%s\t%s\n' "$key(password)" secret >>"$WORK/keys"; fi
        # A URL without credentials (redis://redis:6379, https://api.example) is an address, not a secret.
        if printf '%s' "$val" | grep -Eq '^[a-z+]+://' && [ -z "$pw" ]; then continue; fi
        printf '%s\n' "$val" >>"$WORK/patterns"
        printf '%s\t%s\n' "$key" "$class" >>"$WORK/keys"
      done <"$ROOT/secrets.env"
      nkeys=$(wc -l <"$WORK/keys" | tr -d ' ')
      nfiles=$(wc -l <"$WORK/files.txt" | tr -d ' ')
      (cd "$ROOT" && tr '\n' '\0' <"$WORK/files.txt" | xargs -0 grep -lF -f "$WORK/patterns" -- 2>/dev/null) >"$WORK/hits" || true
      if [ ! -s "$WORK/hits" ]; then
        echo "PASS	secrets-in-tree	0 of $nkeys secret values found in $nfiles files (committable + dist)" >"$WORK/secret-result"
      else
        # Attribute each hit to key names (still without printing values), with a short hash.
        i=0; sev=WARN
        while IFS= read -r pat; do
          i=$((i + 1))
          meta=$(sed -n "${i}p" "$WORK/keys")
          k=${meta%%	*}; class=${meta##*	}
          files=$(cd "$ROOT" && tr '\n' '\0' <"$WORK/hits" | xargs -0 grep -lF -e "$pat" -- 2>/dev/null | tr '\n' ' ')
          [ -n "$files" ] || continue
          fp=$(printf '%s' "$pat" | shasum -a 256 | cut -c1-8)
          echo "    $k [$class, sha256:$fp] in: $files"
          [ "$class" = secret ] && sev=FAIL
        done <"$WORK/patterns"
        echo "$sev	secrets-in-tree	secret values found in $(wc -l <"$WORK/hits" | tr -d ' ') file(s); see above (key names and hashes only)" >"$WORK/secret-result"
      fi
    )
    if [ -s "$WORK/secret-result" ]; then
      IFS='	' read -r st ck dt <"$WORK/secret-result"; record "$st" "$ck" "$dt"
    else
      record FAIL secrets-in-tree "scan did not complete"
    fi
  fi
fi

# ── HTTP helpers ──────────────────────────────────────────────────────────────
# req NAME METHOD PATH [curl args...] → $WORK/NAME.h (headers), $WORK/NAME.b (body), prints status
req() {
  local name=$1 method=$2 path=$3; shift 3
  curl -sS -m 15 -o "$WORK/$name.b" -D "$WORK/$name.h" -w '%{http_code}' -X "$method" "$@" "$API_URL$path" 2>/dev/null || echo 000
}
hdr() { grep -i "^$2:" "$WORK/$1.h" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

API_UP=0
if want headers || want cors || want csrf || want cookies || want ratelimit || want auth; then
  section "HTTP checks against $API_URL"
  code=$(req health GET /healthz)
  if [ "$code" = 200 ]; then API_UP=1; else record SKIP http "API not reachable at $API_URL/healthz (HTTP $code); start it or set API_URL"; fi
fi
is_https() { case $API_URL in https://*) return 0 ;; *) return 1 ;; esac; }

if [ $API_UP = 1 ] && want headers; then
  for p in /healthz /v1/me; do
    n=h$(echo "$p" | tr -c 'a-z' '_')
    req "$n" GET "$p" >/dev/null
    csp=$(hdr "$n" content-security-policy)
    if [ -n "$csp" ]; then record PASS "csp $p" "present"; else record FAIL "csp $p" "Content-Security-Policy missing"; fi
    fa=$(printf '%s' "$csp" | grep -oE "frame-ancestors [^;]+" || true)
    xfo=$(hdr "$n" x-frame-options)
    if [ -n "$fa" ]; then record PASS "frame-ancestors $p" "$fa"
    elif [ -n "$xfo" ]; then record WARN "frame-ancestors $p" "no CSP frame-ancestors, X-Frame-Options: $xfo"
    else record FAIL "frame-ancestors $p" "neither CSP frame-ancestors nor X-Frame-Options"; fi
    nos=$(hdr "$n" x-content-type-options)
    [ "$nos" = nosniff ] && record PASS "nosniff $p" "nosniff" || record FAIL "nosniff $p" "X-Content-Type-Options='${nos}'"
    rp=$(hdr "$n" referrer-policy)
    [ -n "$rp" ] && record PASS "referrer-policy $p" "$rp" || record FAIL "referrer-policy $p" "missing"
    hsts=$(hdr "$n" strict-transport-security)
    if [ -n "$hsts" ]; then
      ma=$(printf '%s' "$hsts" | sed -nE 's/.*max-age=([0-9]+).*/\1/p')
      if [ "${ma:-0}" -ge 15552000 ]; then record PASS "hsts $p" "$hsts"; else record WARN "hsts $p" "max-age below 180 days: $hsts"; fi
    elif is_https; then record FAIL "hsts $p" "Strict-Transport-Security missing on HTTPS"
    else record WARN "hsts $p" "missing (plain-HTTP dev server; required in prod)"; fi
    pb=$(hdr "$n" x-powered-by)
    [ -z "$pb" ] && record PASS "x-powered-by $p" "absent" || record FAIL "x-powered-by $p" "leaks '$pb'"
  done
  rid=$(hdr health x-request-id)
  [ -n "$rid" ] && record PASS x-request-id "present" || record WARN x-request-id "missing (API.md §1.4)"
fi

if [ $API_UP = 1 ] && want cors; then
  req cors_evil OPTIONS /v1/me -H "Origin: $EVIL_ORIGIN" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: content-type' >/dev/null
  acao=$(hdr cors_evil access-control-allow-origin)
  if [ -z "$acao" ]; then record PASS "cors evil preflight" "no Access-Control-Allow-Origin for $EVIL_ORIGIN"
  else record FAIL "cors evil preflight" "Access-Control-Allow-Origin: $acao for $EVIL_ORIGIN"; fi
  req cors_evil_get GET /healthz -H "Origin: $EVIL_ORIGIN" >/dev/null
  acao=$(hdr cors_evil_get access-control-allow-origin)
  if [ -z "$acao" ] || { [ "$acao" != "$EVIL_ORIGIN" ] && [ "$acao" != '*' ]; }; then
    record PASS "cors evil simple GET" "origin not reflected"
  else
    record FAIL "cors evil simple GET" "reflected: $acao"
  fi
  req cors_ok OPTIONS /v1/me -H "Origin: $WEB_ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,x-requested-with' >/dev/null
  acao=$(hdr cors_ok access-control-allow-origin); acac=$(hdr cors_ok access-control-allow-credentials)
  if [ "$acao" = "$WEB_ORIGIN" ] && [ "$acac" = true ]; then record PASS "cors allowed origin" "$WEB_ORIGIN with credentials"
  else record FAIL "cors allowed origin" "for $WEB_ORIGIN got ACAO='$acao' ACAC='$acac'"; fi
fi

if [ $API_UP = 1 ] && want csrf; then
  code=$(req csrf POST /v1/auth/logout -H "Origin: $WEB_ORIGIN")
  if [ "$code" = 403 ] && grep -q '"CSRF"' "$WORK/csrf.b"; then record PASS csrf "POST without X-Requested-With → 403 CSRF"
  else record FAIL csrf "POST /v1/auth/logout without X-Requested-With → HTTP $code $(head -c 120 "$WORK/csrf.b")"; fi
  code=$(req csrf2 POST /v1/auth/logout -H "Origin: $WEB_ORIGIN" -H 'X-Requested-With: XMLHttpRequest')
  [ "$code" = 403 ] && record PASS "csrf wrong value" "X-Requested-With: XMLHttpRequest → 403" || record FAIL "csrf wrong value" "HTTP $code"
fi

check_cookie() { # name label
  local sc; sc=$(grep -i '^set-cookie:' "$WORK/$1.h" | grep -i 'beacon_session' | tail -1 | tr -d '\r')
  if [ -z "$sc" ]; then record FAIL "$2" "no Set-Cookie for beacon_session"; return; fi
  local miss=""
  printf '%s' "$sc" | grep -qi 'httponly' || miss="$miss HttpOnly"
  printf '%s' "$sc" | grep -qi 'samesite=lax' || miss="$miss SameSite=Lax"
  printf '%s' "$sc" | grep -qi 'path=/' || miss="$miss Path=/"
  if is_https; then printf '%s' "$sc" | grep -qi 'secure' || miss="$miss Secure"; fi
  if [ -z "$miss" ]; then record PASS "$2" "HttpOnly; SameSite=Lax$(is_https && echo '; Secure')"
  else record FAIL "$2" "missing:$miss"; fi
  if ! is_https && ! printf '%s' "$sc" | grep -qi 'secure'; then record WARN "$2 Secure" "no Secure flag on plain HTTP (expected in dev; prod must set it)"; fi
}

if [ $API_UP = 1 ] && want cookies; then
  code=$(req logout POST /v1/auth/logout -H "Origin: $WEB_ORIGIN" -H 'X-Requested-With: beacon')
  if [ "$code" = 204 ] || [ "$code" = 200 ]; then check_cookie logout "cookie flags (logout clear)"
  else record FAIL "cookie flags (logout clear)" "POST /v1/auth/logout → HTTP $code"; fi
  if [ -n "${GOOGLE_ID_TOKEN:-}" ]; then
    code=$(req login POST /v1/auth/google -H 'Content-Type: application/json' -H 'X-Requested-With: beacon' --data "{\"credential\":\"$GOOGLE_ID_TOKEN\"}")
    if [ "$code" = 200 ]; then check_cookie login "cookie flags (/v1/auth/google)"; else record FAIL "cookie flags (/v1/auth/google)" "sign-in with GOOGLE_ID_TOKEN → HTTP $code"; fi
  else
    record SKIP "cookie flags (/v1/auth/google)" "needs GOOGLE_ID_TOKEN (a real GIS token); the logout clear-cookie check above covers the same attributes"
  fi
fi

if [ $API_UP = 1 ] && want auth; then
  code=$(req me401 GET /v1/me)
  [ "$code" = 401 ] && grep -q '"missing"' "$WORK/me401.b" && record PASS "auth missing" "401 reason=missing" || record FAIL "auth missing" "GET /v1/me without session → HTTP $code"
  # Built at runtime (HS256 header + far-future claims + a signature that cannot verify), so the
  # repository never contains a literal token for secret scanners to flag.
  b64url() { printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '=\n'; }
  forged="$(b64url '{"alg":"HS256","typ":"JWT"}').$(b64url '{"sub":"650000000000000000000001","sv":0,"exp":4102444800}').$(b64url 'signature-does-not-match')"
  code=$(req me_forged GET /v1/me -H "Authorization: Bearer $forged")
  [ "$code" = 401 ] && grep -q '"invalid"' "$WORK/me_forged.b" && record PASS "auth forged" "401 reason=invalid" || record FAIL "auth forged" "forged JWT → HTTP $code $(head -c 100 "$WORK/me_forged.b")"
  code=$(req me_none GET /v1/me -H "Authorization: Bearer $(b64url '{"alg":"none"}').$(b64url '{"sub":"x"}').")
  [ "$code" = 401 ] && record PASS "auth alg=none" "401" || record FAIL "auth alg=none" "HTTP $code"
fi

if [ $API_UP = 1 ] && want ratelimit; then
  if [ $RATE_LIMIT = 0 ]; then
    record SKIP ratelimit "--no-rate-limit given"
  else
    got429=0; retry=""
    for i in $(seq 1 14); do
      code=$(req rl POST /v1/auth/google -H 'Content-Type: application/json' -H 'X-Requested-With: beacon' --data '{"credential":"not-a-real-token"}')
      if [ "$code" = 429 ]; then got429=$i; retry=$(hdr rl retry-after); break; fi
    done
    if [ $got429 -gt 0 ]; then record PASS ratelimit "429 on request $got429 of POST /v1/auth/google (Retry-After: ${retry:-none})"
    else record FAIL ratelimit "no 429 after 14 sign-in attempts in a burst (limit is 10/min, API.md §1.5)"; fi
    pol=$(hdr rl ratelimit-policy)
    [ -n "$pol" ] && record PASS "ratelimit headers" "RateLimit-Policy: $pol" || record WARN "ratelimit headers" "RateLimit-Policy header missing"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Summary"
p=$(grep -c '^PASS' "$RESULTS" || true); f=$(grep -c '^FAIL' "$RESULTS" || true)
w=$(grep -c '^WARN' "$RESULTS" || true); s=$(grep -c '^SKIP' "$RESULTS" || true)
echo "PASS $p · FAIL $f · WARN $w · SKIP $s  (API $API_URL)"
if [ -n "$REPORT" ]; then
  {
    echo "| Status | Check | Detail |"
    echo "|---|---|---|"
    while IFS='	' read -r st ck dt; do printf '| %s | %s | %s |\n' "$st" "$ck" "$(printf '%s' "$dt" | sed 's/|/\\|/g')"; done <"$RESULTS"
  } >"$REPORT"
  echo "report: $REPORT"
fi
[ "$FAILS" -eq 0 ]
