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

# Prepare an application-owned 0600 bearer token without placing the secret in
# the Pica container environment or image metadata.
printf '%s' "$TOKEN" | docker run --rm -i   --user 0   --entrypoint /bin/sh   --mount "type=volume,src=$SECRET_VOLUME,dst=/secret"   "$IMAGE"   -c 'set -eu; umask 077; cat > /secret/token; chown 10001:10001 /secret/token; chmod 0600 /secret/token'

docker run --detach   --name "$PICA_NAME"   --network "$NETWORK"   --network-alias pica   --mount "type=volume,src=$CONFIG_VOLUME,dst=/config"   --mount "type=volume,src=$SECRET_VOLUME,dst=/run/pica-secret,readonly"   -e PICA_LIBRARY_REMOTE_TOKEN_FILE=/run/pica-secret/token   -e PICA_LIBRARY_REMOTE_HOST=0.0.0.0   -e PICA_LIBRARY_REMOTE_PORT=8787   -e PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY=true   -e PICA_LIBRARY_REMOTE_ALLOWED_HOSTS=pica.test   "$IMAGE"   --remote-api >/dev/null

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

# Verify the gateway itself is alive before adding the TLS terminator.
for _ in $(seq 1 120); do
  if ! docker inspect "$PICA_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
    fail "Pica Remote API container exited during startup"
  fi
  STATUS="$(
    docker exec "$PICA_NAME" /opt/pica/runtime/bin/node -e       "fetch('http://127.0.0.1:8787/healthz',{headers:{host:'pica.test'}}).then(async r=>{process.stdout.write(String(r.status))}).catch(()=>process.exit(1))"       2>/dev/null || true
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
    if curl --fail --silent --show-error       --cacert "$ROOT_CA"       --resolve "pica.test:$HOST_PORT:127.0.0.1"       "https://pica.test:$HOST_PORT/healthz" >/dev/null 2>&1; then
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
if(value.features?.updatePackages!==false)fail('Remote Linux runtime must not self-update')
NODE

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
if [[ -n "$(docker port "$PICA_NAME" 2>/dev/null)" ]]; then
  fail "Pica container published a host port after restart"
fi

echo "Docker authenticated TLS Remote API acceptance: PASS"
