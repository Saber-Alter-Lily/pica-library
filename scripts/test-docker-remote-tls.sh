#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${1:-}"
CADDY_IMAGE="${PICA_LIBRARY_CADDY_IMAGE:-caddy:2.11.4-alpine}"
TOKEN="w4b-remote-api-acceptance-token-0123456789abcdef"

if [[ -z "$IMAGE" ]]; then
  if [[ -f "$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt" ]]; then
    IMAGE="$(tr -d '\r\n' < "$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt")"
  fi
fi
if [[ -z "$IMAGE" ]]; then
  echo "Usage: $0 <docker-image-tag>" >&2
  exit 2
fi

SUFFIX="$$"
PICA_NAME="pica-library-remote-$SUFFIX"
CADDY_NAME="pica-library-caddy-$SUFFIX"
NETWORK="pica-library-remote-net-$SUFFIX"
CONFIG_VOLUME="pica-library-config-$SUFFIX"
SECRET_VOLUME="pica-library-secret-$SUFFIX"
CADDY_DATA_VOLUME="pica-library-caddy-data-$SUFFIX"
CADDY_CONFIG_VOLUME="pica-library-caddy-config-$SUFFIX"
WORK="$(mktemp -d)"
CADDYFILE="$WORK/Caddyfile"
ROOT_CA="$WORK/caddy-root.crt"

cleanup() {
  docker rm -f "$CADDY_NAME" "$PICA_NAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  docker volume rm -f     "$CONFIG_VOLUME"     "$SECRET_VOLUME"     "$CADDY_DATA_VOLUME"     "$CADDY_CONFIG_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "Docker Remote TLS gate: $*" >&2
  echo "----- Pica logs -----" >&2
  docker logs "$PICA_NAME" >&2 2>/dev/null || true
  echo "----- Caddy logs -----" >&2
  docker logs "$CADDY_NAME" >&2 2>/dev/null || true
  exit 1
}

docker image inspect "$IMAGE" >/dev/null
docker pull --quiet "$CADDY_IMAGE" >/dev/null

docker network create "$NETWORK" >/dev/null
docker volume create "$CONFIG_VOLUME" >/dev/null
docker volume create "$SECRET_VOLUME" >/dev/null
docker volume create "$CADDY_DATA_VOLUME" >/dev/null
docker volume create "$CADDY_CONFIG_VOLUME" >/dev/null

# Make the persistent application volume writable only by the non-root runtime.
docker run --rm \
  --user 0 \
  --entrypoint /bin/sh \
  --mount "type=volume,src=$CONFIG_VOLUME,dst=/config" \
  "$IMAGE" \
  -c 'set -eu; chown 10001:10001 /config; chmod 0700 /config'

# Prepare an application-owned 0600 bearer token without placing the secret in
# the Pica container environment or image metadata.
printf '%s' "$TOKEN" | docker run --rm -i   --user 0   --entrypoint /bin/sh   --mount "type=volume,src=$SECRET_VOLUME,dst=/secret"   "$IMAGE"   -c 'set -eu; umask 077; cat > /secret/token; chown 10001:10001 /secret/token; chmod 0600 /secret/token'

docker run --detach   --name "$PICA_NAME"   --network "$NETWORK"   --network-alias pica   --mount "type=volume,src=$CONFIG_VOLUME,dst=/config"   --mount "type=volume,src=$SECRET_VOLUME,dst=/run/pica-secret,readonly"   -e PICA_LIBRARY_REMOTE_TOKEN_FILE=/run/pica-secret/token   -e PICA_LIBRARY_REMOTE_HOST=0.0.0.0   -e PICA_LIBRARY_REMOTE_PORT=8787   -e PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY=true   -e PICA_LIBRARY_REMOTE_ALLOWED_HOSTS=pica.test,127.0.0.1   -e PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS=https://pica.test   -e PICA_LIBRARY_REMOTE_WEB_SESSIONS=true   "$IMAGE"   --remote-api >/dev/null

if [[ -n "$(docker port "$PICA_NAME" 2>/dev/null)" ]]; then
  fail "Pica Remote API must not publish a host port directly"
fi
if [[ "$(docker inspect "$PICA_NAME" --format '{{.Config.User}}')" != "10001:10001" ]]; then
  fail "Pica container is not running under the non-root image identity"
fi

SECRET_MODE="$(
  docker exec "$PICA_NAME" /opt/pica/runtime/bin/node -e     "const fs=require('fs');const s=fs.statSync('/run/pica-secret/token');process.stdout.write((s.mode&0o777).toString(8)+' '+s.uid+' '+s.gid)"
)"
if [[ "$SECRET_MODE" != "600 10001 10001" ]]; then
  fail "Remote API bearer secret is not mounted as 0600 owned by UID/GID 10001: $SECRET_MODE"
fi
if ! docker exec "$PICA_NAME" /opt/pica/runtime/bin/node -e   "if(!require('fs').existsSync('/config/data/library.db'))process.exit(1)"; then
  fail "Pica container did not initialize the persistent /config database"
fi

# Verify the gateway itself is alive before adding the TLS terminator.
for _ in $(seq 1 120); do
  if ! docker inspect "$PICA_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
    fail "Pica Remote API container exited during startup"
  fi
  STATUS="$(
    docker exec "$PICA_NAME" /opt/pica/runtime/bin/node -e       "fetch('http://127.0.0.1:8787/healthz').then(async r=>{process.stdout.write(String(r.status))}).catch(()=>process.exit(1))"       2>/dev/null || true
  )"
  if [[ "$STATUS" == "200" ]]; then
    break
  fi
  sleep 0.25
done
if [[ "$STATUS" != "200" ]]; then
  fail "Pica Remote API gateway did not become healthy"
fi

cat > "$CADDYFILE" <<'EOF'
{
    admin off
}

pica.test {
    tls internal
    reverse_proxy pica:8787
}
EOF

docker run --detach   --name "$CADDY_NAME"   --network "$NETWORK"   -p 127.0.0.1::443   --mount "type=bind,src=$CADDYFILE,dst=/etc/caddy/Caddyfile,readonly"   --mount "type=volume,src=$CADDY_DATA_VOLUME,dst=/data"   --mount "type=volume,src=$CADDY_CONFIG_VOLUME,dst=/config"   "$CADDY_IMAGE" >/dev/null

PORT_MAPPING="$(docker port "$CADDY_NAME" 443/tcp | head -n 1)"
HOST_PORT="${PORT_MAPPING##*:}"
if [[ ! "$HOST_PORT" =~ ^[0-9]+$ ]]; then
  fail "Could not resolve the Caddy HTTPS host port: $PORT_MAPPING"
fi

for _ in $(seq 1 120); do
  if ! docker inspect "$CADDY_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
    fail "Caddy exited during startup"
  fi
  if docker exec "$CADDY_NAME" test -s /data/caddy/pki/authorities/local/root.crt >/dev/null 2>&1; then
    docker cp "$CADDY_NAME:/data/caddy/pki/authorities/local/root.crt" "$ROOT_CA" >/dev/null
    if curl --fail --silent --show-error --noproxy '*'       --cacert "$ROOT_CA"       --resolve "pica.test:$HOST_PORT:127.0.0.1"       "https://pica.test:$HOST_PORT/healthz" >/dev/null 2>&1; then
      break
    fi
  fi
  sleep 0.25
done
if [[ ! -s "$ROOT_CA" ]]; then
  fail "Caddy internal root certificate was not produced"
fi

BASE="https://pica.test:$HOST_PORT"
CURL_TLS=(
  --silent
  --show-error
  --noproxy '*'
  --cacert "$ROOT_CA"
  --resolve "pica.test:$HOST_PORT:127.0.0.1"
)

HEALTH_FILE="$WORK/health.json"
curl --fail "${CURL_TLS[@]}" "$BASE/healthz" > "$HEALTH_FILE"
node - "$HEALTH_FILE" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(value.status!=='ok')throw new Error('Remote health is not ok')
if(value.application!=='Pica Library')throw new Error('Remote health leaked or lost application identity')
if(value.remoteApiVersion!==1)throw new Error('Remote API version mismatch')
if(Object.keys(value).sort().join(',')!=='application,remoteApiVersion,status')
  throw new Error('Remote health endpoint is not minimal')
NODE

UNAUTH_STATUS="$(
  curl "${CURL_TLS[@]}"     --output /dev/null     --write-out '%{http_code}'     "$BASE/api/v1/capabilities"
)"
if [[ "$UNAUTH_STATUS" != "401" ]]; then
  fail "HTTPS gateway did not require bearer authentication: $UNAUTH_STATUS"
fi

CAP_FILE="$WORK/capabilities.json"
curl --fail "${CURL_TLS[@]}"   -H "Authorization: Bearer $TOKEN"   "$BASE/api/v1/capabilities" > "$CAP_FILE"
node - "$CAP_FILE" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const fail=(message)=>{throw new Error(message)}
if(value.runtime?.role!=='server')fail('Remote runtime role is not server')
if(value.runtime?.mode!=='headless')fail('Remote runtime mode is not headless')
if(value.capabilityStates?.remoteApi?.supported!==true)fail('Remote API support missing')
if(value.capabilityStates?.remoteApi?.available!==true)fail('Remote API availability missing')
if(value.features?.remoteApi!==true)fail('Remote API compatibility flag missing')
if(value.capabilityStates?.remoteWebSessions?.available!==true)fail('Remote Web session capability missing')
if(value.features?.remoteWebSessions!==true)fail('Remote Web session compatibility flag missing')
if(value.capabilityStates?.remoteWebShell?.available!==true)fail('Remote Web shell capability missing')
if(value.features?.remoteWebShell!==true)fail('Remote Web shell compatibility flag missing')
if(value.features?.updatePackages!==false)fail('Remote Linux runtime must not self-update')
NODE

REMOTE_SHELL_HEADERS="$WORK/remote-shell-headers.txt"
REMOTE_SHELL_HTML="$WORK/remote-shell.html"
curl --fail "${CURL_TLS[@]}" \
  --dump-header "$REMOTE_SHELL_HEADERS" \
  "$BASE/remote/" > "$REMOTE_SHELL_HTML"

if ! grep -Fq 'Pica Library Remote' "$REMOTE_SHELL_HTML"; then
  fail "Remote Web shell HTML was not served through Caddy TLS"
fi
if ! grep -qi "^content-security-policy: .*default-src 'none'" "$REMOTE_SHELL_HEADERS"; then
  fail "Remote Web shell strict CSP header is missing"
fi
if ! grep -qi '^x-frame-options: DENY' "$REMOTE_SHELL_HEADERS"; then
  fail "Remote Web shell framing protection is missing"
fi
if ! grep -qi '^referrer-policy: no-referrer' "$REMOTE_SHELL_HEADERS"; then
  fail "Remote Web shell referrer policy is missing"
fi
if ! grep -qi '^permissions-policy: .*camera=()' "$REMOTE_SHELL_HEADERS"; then
  fail "Remote Web shell permissions policy is missing"
fi
REMOTE_JS="$WORK/remote.js"
curl --fail "${CURL_TLS[@]}" "$BASE/remote/remote.js" > "$REMOTE_JS"
if ! grep -Fq '/remote/v1/session/bootstrap' "$REMOTE_JS"; then
  fail "Remote Web shell JavaScript bootstrap path is missing"
fi
if grep -Eq 'serviceWorker|localStorage|sessionStorage' "$REMOTE_JS"; then
  fail "Remote Web shell unexpectedly uses offline/browser persistent storage"
fi

SESSION_HEADERS="$WORK/session-headers.txt"
SESSION_BODY="$WORK/session-bootstrap.json"
curl --fail "${CURL_TLS[@]}" \
  --dump-header "$SESSION_HEADERS" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Origin: https://pica.test" \
  "$BASE/remote/v1/session/bootstrap" > "$SESSION_BODY"

SESSION_SET_COOKIE="$(
  tr -d '\r' < "$SESSION_HEADERS" |
    sed -n 's/^[Ss]et-[Cc]ookie:[[:space:]]*//p' |
    head -n 1
)"
if [[ ! "$SESSION_SET_COOKIE" =~ ^__Host-pica_session=[A-Za-z0-9_-]+\; ]]; then
  fail "Remote Web bootstrap did not return the expected __Host cookie"
fi
for required in 'Path=/' 'HttpOnly' 'Secure' 'SameSite=Strict'; do
  if [[ "$SESSION_SET_COOKIE" != *"$required"* ]]; then
    fail "Remote Web session cookie is missing $required"
  fi
done
if grep -qi 'Domain=' <<<"$SESSION_SET_COOKIE"; then
  fail "Remote Web __Host cookie must not contain Domain"
fi
SESSION_COOKIE="${SESSION_SET_COOKIE%%;*}"
SESSION_CSRF="$(
  node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(v.authenticated!==true||typeof v.csrfToken!=='string'||!v.csrfToken)process.exit(1);process.stdout.write(v.csrfToken)" "$SESSION_BODY"
)"
if [[ -z "$SESSION_COOKIE" || -z "$SESSION_CSRF" ]]; then
  fail "Remote Web bootstrap values are incomplete"
fi
if grep -F "$TOKEN" "$SESSION_HEADERS" "$SESSION_BODY" >/dev/null 2>&1; then
  fail "Long-lived bearer token leaked into Remote Web session response"
fi

SESSION_CAP_STATUS="$(
  curl "${CURL_TLS[@]}" \
    -H "Cookie: $SESSION_COOKIE" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$BASE/api/v1/capabilities"
)"
if [[ "$SESSION_CAP_STATUS" != "200" ]]; then
  fail "Remote Web cookie-only capability request failed: $SESSION_CAP_STATUS"
fi

SESSION_STATUS_FILE="$WORK/browser-session.json"
curl --fail "${CURL_TLS[@]}" \
  -H "Cookie: $SESSION_COOKIE" \
  "$BASE/remote/v1/session" > "$SESSION_STATUS_FILE"
node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(v.authenticated!==true||v.csrfToken!==process.argv[2])process.exit(1)" "$SESSION_STATUS_FILE" "$SESSION_CSRF"

SESSION_NO_CSRF="$(
  curl "${CURL_TLS[@]}" \
    -X POST \
    -H "Cookie: $SESSION_COOKIE" \
    -H "Origin: https://pica.test" \
    -H 'Content-Type: application/json' \
    --data '{"scope":"favorites","text":"fixture","limit":1}' \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$BASE/api/v1/library/query"
)"
if [[ "$SESSION_NO_CSRF" != "403" ]]; then
  fail "Remote Web session write succeeded without CSRF: $SESSION_NO_CSRF"
fi

SESSION_QUERY="$WORK/session-query.json"
curl --fail "${CURL_TLS[@]}" \
  -X POST \
  -H "Cookie: $SESSION_COOKIE" \
  -H "Origin: https://pica.test" \
  -H "X-Pica-CSRF: $SESSION_CSRF" \
  -H 'Content-Type: application/json' \
  --data '{"scope":"favorites","text":"fixture","limit":1}' \
  "$BASE/api/v1/library/query" > "$SESSION_QUERY"
node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(!v||typeof v!=='object')process.exit(1)" "$SESSION_QUERY"

SESSION_PROGRESS_WRITE="$(
  curl "${CURL_TLS[@]}" \
    -X POST \
    -H "Cookie: $SESSION_COOKIE" \
    -H "Origin: https://pica.test" \
    -H "X-Pica-CSRF: $SESSION_CSRF" \
    -H 'Content-Type: application/json' \
    --data '{"comicId":"fixture","episodeId":"fixture","pageIndex":0}' \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$BASE/api/v1/reader/progress"
)"
if [[ "$SESSION_PROGRESS_WRITE" != "404" ]]; then
  fail "Remote Web read-only session escaped into reader-progress mutation: $SESSION_PROGRESS_WRITE"
fi

BEARER_PROGRESS_STATUS="$(
  curl "${CURL_TLS[@]}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data '{"comicId":"fixture","episodeId":"fixture","pageIndex":0}' \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$BASE/api/v1/reader/progress"
)"
if [[ "$BEARER_PROGRESS_STATUS" == "404" || "$BEARER_PROGRESS_STATUS" == "401" ]]; then
  fail "W5-B unexpectedly removed bearer access to the W4B reader-progress route: $BEARER_PROGRESS_STATUS"
fi

BLOCKED_DESKTOP="$(
  curl "${CURL_TLS[@]}"     -H "Authorization: Bearer $TOKEN"     --output /dev/null     --write-out '%{http_code}'     "$BASE/api/v1/desktop/status"
)"
if [[ "$BLOCKED_DESKTOP" != "404" ]]; then
  fail "Desktop management route escaped the Remote API allowlist: $BLOCKED_DESKTOP"
fi

BLOCKED_ORIGIN="$(
  curl "${CURL_TLS[@]}"     -H "Authorization: Bearer $TOKEN"     -H "Origin: https://attacker.example"     --output /dev/null     --write-out '%{http_code}'     "$BASE/api/v1/capabilities"
)"
if [[ "$BLOCKED_ORIGIN" != "403" ]]; then
  fail "Unapproved browser Origin was not rejected: $BLOCKED_ORIGIN"
fi

DIRECT_BAD_HOST="$(
  docker exec "$CADDY_NAME" curl     --silent     --output /dev/null     --write-out '%{http_code}'     -H "Host: attacker.example"     -H "Authorization: Bearer $TOKEN"     "http://pica:8787/api/v1/status"
)"
if [[ "$DIRECT_BAD_HOST" != "403" ]]; then
  fail "Direct gateway Host validation failed: $DIRECT_BAD_HOST"
fi

if docker inspect "$PICA_NAME" --format '{{json .Config.Env}}' | grep -F "$TOKEN" >/dev/null; then
  fail "Bearer token leaked into Pica container environment metadata"
fi
if docker logs "$PICA_NAME" 2>&1 | grep -F "$TOKEN" >/dev/null; then
  fail "Bearer token leaked into Pica logs"
fi
if docker logs "$CADDY_NAME" 2>&1 | grep -F "$TOKEN" >/dev/null; then
  fail "Bearer token leaked into Caddy logs"
fi

# Restart the application container with the same config + secret volumes and
# require the TLS-only remote path to recover without publishing Pica directly.
docker stop --time 10 "$PICA_NAME" >/dev/null
if [[ "$(docker inspect "$PICA_NAME" --format '{{.State.ExitCode}}')" != "0" ]]; then
  fail "Pica container did not stop cleanly before remote restart"
fi
docker start "$PICA_NAME" >/dev/null

RECOVERED=""
for _ in $(seq 1 120); do
  RECOVERED="$(
    curl "${CURL_TLS[@]}"       -H "Authorization: Bearer $TOKEN"       --output /dev/null       --write-out '%{http_code}'       "$BASE/api/v1/capabilities" 2>/dev/null || true
  )"
  if [[ "$RECOVERED" == "200" ]]; then
    break
  fi
  sleep 0.25
done
if [[ "$RECOVERED" != "200" ]]; then
  fail "Remote HTTPS path did not recover after Pica container restart"
fi

STALE_SESSION="$(
  curl "${CURL_TLS[@]}" \
    -H "Cookie: $SESSION_COOKIE" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$BASE/api/v1/capabilities" 2>/dev/null || true
)"
if [[ "$STALE_SESSION" != "401" ]]; then
  fail "Process-local Remote Web session survived Pica restart: $STALE_SESSION"
fi

if [[ -n "$(docker port "$PICA_NAME" 2>/dev/null)" ]]; then
  fail "Pica container published a host port after restart"
fi

echo "Docker authenticated TLS Remote API acceptance: PASS"
