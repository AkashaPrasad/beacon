#!/usr/bin/env bash
# Post-deploy smoke test for Beacon (SPEC §8 "Deployment smoke").
#
#   scripts/smoke-prod.sh                       # public checks against prod
#   WEB_URL=http://localhost:4173 API_URL=http://localhost:4000 scripts/smoke-prod.sh   # any env
#   BEACON_SESSION=<cookie value> scripts/smoke-prod.sh --full                          # owner: signed-in checks
#   BEACON_SESSION=… scripts/smoke-prod.sh --full --ingest https://boards.greenhouse.io/<token>
#
# --full needs the value of the `beacon_session` cookie from a signed-in browser
# (DevTools → Application → Cookies → api.beacon.spacesdrive.cc). It is sent only to API_URL and
# never printed. --ingest adds that URL as a personal source, waits for its first ingest to
# finish (health leaves `pending`), then deletes it again.
#
# Exit 1 on any FAIL. Prints a timing summary (connect / TLS / first byte / total per request).
set -uo pipefail

WEB_URL=${WEB_URL:-https://beacon.spacesdrive.cc}; WEB_URL=${WEB_URL%/}
API_URL=${API_URL:-https://api.beacon.spacesdrive.cc}; API_URL=${API_URL%/}
FULL=0
INGEST_URL=""
while [ $# -gt 0 ]; do
  case $1 in
    --full) FULL=1; shift ;;
    --ingest) INGEST_URL=$2; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

WORK=$(mktemp -d "${TMPDIR:-/tmp}/beacon-smoke.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
FAILS=0
TIMINGS="$WORK/timings"
: >"$TIMINGS"

ok() { printf '\033[32mPASS\033[0m %s\n' "$*"; }
bad() { printf '\033[31mFAIL\033[0m %s\n' "$*"; FAILS=$((FAILS + 1)); }
warn() { printf '\033[33mWARN\033[0m %s\n' "$*"; }

# get NAME URL [curl args...] → prints status; body in $WORK/NAME.b, headers in $WORK/NAME.h
get() {
  local name=$1 url=$2; shift 2
  local out
  out=$(curl -sS -m 20 -o "$WORK/$name.b" -D "$WORK/$name.h" \
    -w '%{http_code} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}' "$@" "$url" 2>"$WORK/$name.err") || out="000 0 0 0 0"
  set -- $out
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$1" "$2" "$3" "$4" "$5" >>"$TIMINGS"
  echo "$1"
}
hdr() { grep -i "^$2:" "$WORK/$1.h" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

echo "Beacon smoke · web $WEB_URL · api $API_URL$([ $FULL = 1 ] && echo ' · full')"

# ── Reachability gate: one clear failure instead of twenty when DNS/TLS/origin is down ──
reach() {
  local code; code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$1" 2>"$WORK/reach.err")
  if [ "$code" = 000 ]; then echo "000 ($(tr -d '\n' <"$WORK/reach.err" | cut -c1-120))"; else echo "$code"; fi
}
api_reach=$(reach "$API_URL/healthz"); web_reach=$(reach "$WEB_URL/")
case $api_reach in [1-5][0-9][0-9]) ;; *) bad "API unreachable at $API_URL: $api_reach"; ;; esac
case $web_reach in [1-5][0-9][0-9]) ;; *) bad "web unreachable at $WEB_URL: $web_reach"; ;; esac
if [ "$FAILS" -gt 0 ]; then echo "smoke: stopped, nothing to test until both hosts answer"; exit 1; fi

# ── API liveness / readiness ──────────────────────────────────────────────────
c=$(get healthz "$API_URL/healthz")
[ "$c" = 200 ] && grep -q '"ok":true' "$WORK/healthz.b" && ok "GET /healthz 200 {ok:true}" || bad "GET /healthz → $c $(head -c 120 "$WORK/healthz.b" 2>/dev/null)"
c=$(get readyz "$API_URL/readyz")
if [ "$c" = 200 ]; then ok "GET /readyz 200 $(head -c 80 "$WORK/readyz.b")"; else bad "GET /readyz → $c $(head -c 120 "$WORK/readyz.b" 2>/dev/null)"; fi

# ── OpenAPI ───────────────────────────────────────────────────────────────────
c=$(get openapi "$API_URL/openapi.json")
if [ "$c" = 200 ] && node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!/^3\./.test(d.openapi)||!d.paths||!Object.keys(d.paths).length)process.exit(1);console.log(Object.keys(d.paths).length)' "$WORK/openapi.b" >"$WORK/npaths" 2>/dev/null; then
  ok "GET /openapi.json 200, OpenAPI $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).openapi)' "$WORK/openapi.b"), $(cat "$WORK/npaths") paths"
else bad "GET /openapi.json → $c (not an OpenAPI 3 document)"; fi
c=$(get docs "$API_URL/docs")
[ "$c" = 200 ] && ok "GET /docs 200" || warn "GET /docs → $c"

# ── Web ───────────────────────────────────────────────────────────────────────
c=$(get web "$WEB_URL/")
title=$( (tr -d '\n' <"$WORK/web.b") 2>/dev/null | sed -nE 's/.*<title>([^<]*)<\/title>.*/\1/p')
if [ "$c" = 200 ] && printf '%s' "$title" | grep -q 'Beacon'; then ok "GET $WEB_URL/ 200, title \"$title\""; else bad "GET $WEB_URL/ → $c, title \"$title\""; fi
c=$(get web_spa "$WEB_URL/radar")
[ "$c" = 200 ] && ok "GET /radar 200 (SPA fallback)" || bad "GET $WEB_URL/radar → $c (SPA _redirects missing?)"
c=$(get web_sw "$WEB_URL/sw.js")
[ "$c" = 200 ] && ok "GET /sw.js 200" || warn "GET /sw.js → $c (service worker not served at /sw.js)"
c=$(get web_manifest "$WEB_URL/manifest.webmanifest")
[ "$c" = 200 ] && ok "GET /manifest.webmanifest 200" || warn "GET /manifest.webmanifest → $c"

# ── Security headers ──────────────────────────────────────────────────────────
for target in healthz web; do
  label=$([ $target = web ] && echo web || echo api)
  for h in content-security-policy strict-transport-security x-content-type-options referrer-policy; do
    v=$(hdr $target "$h")
    if [ -n "$v" ]; then ok "$label $h: $(printf '%s' "$v" | cut -c1-70)"
    elif [ $label = web ] && [ "$h" = content-security-policy ]; then warn "web $h missing (apps/web/public/_headers)"
    else bad "$label $h missing"; fi
  done
  fa=$(hdr $target content-security-policy | grep -oE 'frame-ancestors [^;]+' || true)
  xfo=$(hdr $target x-frame-options)
  [ -n "$fa$xfo" ] && ok "$label framing blocked (${fa:-X-Frame-Options $xfo})" || bad "$label allows framing (no frame-ancestors / X-Frame-Options)"
  pb=$(hdr $target x-powered-by)
  [ -z "$pb" ] || bad "$label leaks X-Powered-By: $pb"
done

# ── TLS ───────────────────────────────────────────────────────────────────────
for url in "$API_URL" "$WEB_URL"; do
  case $url in
    https://*)
      host=${url#https://}; host=${host%%/*}
      end=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
      if [ -z "$end" ]; then bad "TLS $host: could not read the certificate"; continue; fi
      days=$(node -e 'console.log(Math.floor((new Date(process.argv[1]) - Date.now()) / 864e5))' "$end")
      # curl already verified the chain and hostname for every request above.
      if [ "$days" -ge 14 ]; then ok "TLS $host valid, expires in $days d"; else bad "TLS $host expires in $days d"; fi
      ;;
    *) warn "TLS not checked for $url (plain HTTP)" ;;
  esac
done

# ── CORS ──────────────────────────────────────────────────────────────────────
get cors_ok "$API_URL/v1/me" -X OPTIONS -H "Origin: $WEB_URL" -H 'Access-Control-Request-Method: GET' >/dev/null
a=$(hdr cors_ok access-control-allow-origin); cr=$(hdr cors_ok access-control-allow-credentials)
[ "$a" = "$WEB_URL" ] && [ "$cr" = true ] && ok "CORS allows $WEB_URL with credentials" || bad "CORS for $WEB_URL: ACAO='$a' ACAC='$cr'"
get cors_evil "$API_URL/v1/me" -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' >/dev/null
a=$(hdr cors_evil access-control-allow-origin)
[ -z "$a" ] && ok "CORS rejects https://evil.example" || bad "CORS allows https://evil.example (ACAO='$a')"

# ── Public data ───────────────────────────────────────────────────────────────
c=$(get meta "$API_URL/v1/meta")
n=$(node -e 'try{console.log((JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).packs||[]).length)}catch{console.log(0)}' "$WORK/meta.b")
[ "$c" = 200 ] && [ "$n" -gt 0 ] && ok "GET /v1/meta 200, $n source packs" || bad "GET /v1/meta → $c, $n packs"
c=$(get community_anon "$API_URL/v1/sources/community?limit=5")
[ "$c" = 401 ] && ok "GET /v1/sources/community without a session → 401 (auth enforced)" || bad "GET /v1/sources/community without a session → $c (expected 401)"

# ── Signed-in checks (owner) ──────────────────────────────────────────────────
if [ $FULL = 1 ]; then
  if [ -z "${BEACON_SESSION:-}" ]; then bad "--full needs BEACON_SESSION (the beacon_session cookie value)"; else
    cookie=(-H "Cookie: beacon_session=$BEACON_SESSION")
    c=$(get me "$API_URL/v1/me" "${cookie[@]}")
    [ "$c" = 200 ] && ok "GET /v1/me 200 (session valid; Google login round-trip worked)" || bad "GET /v1/me → $c (session expired? sign in again)"
    c=$(get community "$API_URL/v1/sources/community?limit=50" "${cookie[@]}")
    n=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).items.length)}catch{console.log(0)}' "$WORK/community.b")
    [ "$c" = 200 ] && [ "$n" -gt 0 ] && ok "GET /v1/sources/community 200, $n pack sources" || bad "GET /v1/sources/community → $c, $n items"
    c=$(get packs "$API_URL/v1/sources/packs" "${cookie[@]}")
    [ "$c" = 200 ] && ok "GET /v1/sources/packs 200" || bad "GET /v1/sources/packs → $c"
    c=$(get feed "$API_URL/v1/feed?limit=20" "${cookie[@]}")
    n=$(node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`${d.items.length} items, warmingUp=${d.warmingUp}`)}catch{console.log("unparseable")}' "$WORK/feed.b")
    [ "$c" = 200 ] && ok "GET /v1/feed 200 ($n)" || bad "GET /v1/feed → $c"
    c=$(get credits "$API_URL/v1/sources/credits" "${cookie[@]}")
    [ "$c" = 200 ] && ok "GET /v1/sources/credits 200 $(head -c 120 "$WORK/credits.b")" || bad "GET /v1/sources/credits → $c"
    c=$(get notif "$API_URL/v1/notifications?limit=5" "${cookie[@]}")
    [ "$c" = 200 ] && ok "GET /v1/notifications 200" || bad "GET /v1/notifications → $c"

    if [ -n "$INGEST_URL" ]; then
      c=$(get src_add "$API_URL/v1/sources" "${cookie[@]}" -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: beacon' \
        --data "{\"url\":\"$INGEST_URL\",\"refreshInterval\":\"daily\"}")
      sid=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).source.id)}catch{}' "$WORK/src_add.b")
      if [ "$c" != 201 ] || [ -z "$sid" ]; then bad "POST /v1/sources → $c $(head -c 160 "$WORK/src_add.b")"; else
        health=pending
        for i in $(seq 1 24); do
          sleep 5
          get src_poll "$API_URL/v1/sources/$sid" "${cookie[@]}" >/dev/null
          health=$(node -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).source;console.log(`${s.health} ${s.listingsFound}`)}catch{console.log("unknown")}' "$WORK/src_poll.b")
          case $health in pending*|unknown) continue ;; *) break ;; esac
        done
        case $health in healthy*) ok "ingest job completed: source $health listings" ;; *) bad "ingest did not complete in 120 s (health: $health)" ;; esac
        c=$(get src_del "$API_URL/v1/sources/$sid" "${cookie[@]}" -X DELETE -H 'X-Requested-With: beacon')
        [ "$c" = 204 ] && ok "test source removed" || warn "DELETE /v1/sources/$sid → $c (remove it in Sources)"
      fi
    fi
  fi
fi

# ── Timing summary ────────────────────────────────────────────────────────────
echo
echo "Timing (seconds): request                 status  connect   tls       ttfb      total"
while IFS='	' read -r name code tc ta ts tt; do
  printf '                  %-24s %-7s %-9s %-9s %-9s %s\n' "$name" "$code" "$tc" "$ta" "$ts" "$tt"
done <"$TIMINGS"
slowest=$(sort -t'	' -k6 -nr "$TIMINGS" | head -1 | cut -f1,6 | tr '\t' ' ')
echo "slowest: $slowest s"
echo
[ "$FAILS" -eq 0 ] && echo "smoke: all checks passed" || echo "smoke: $FAILS check(s) failed"
[ "$FAILS" -eq 0 ]
