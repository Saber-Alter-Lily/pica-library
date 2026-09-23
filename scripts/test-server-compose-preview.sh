#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${1:-}"
COMPOSE_FILE="$ROOT/packaging/docker/server-preview/compose.yaml"
PROJECT="pica-server-preview-ci-${GITHUB_RUN_ID:-$$}"
DOMAIN="pica.test"
TOKEN="compose-preview-token-0123456789abcdef0123456789"
WORK="$(mktemp -d)"
TOKEN_FILE="$WORK/remote-api-token"
CADDYFILE="$WORK/Caddyfile"
ROOT_CA="$WORK/caddy-root.crt"
HTTP_PORT="18080"
HTTPS_PORT="18443"

if [[ -z "$IMAGE" ]]; then
  if [[ -f "$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt" ]]; then
    IMAGE="$(tr -d '\r\n' < "$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt")"
  fi
fi
if [[ -z "$IMAGE" ]]; then
  echo "Usage: $0 <docker-image-tag>" >&2
  exit 2
fi

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "Server Compose preview gate: $*" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps >&2 2>/dev/null || true
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color >&2 2>/dev/null || true
  exit 1
}

docker image inspect "$IMAGE" >/dev/null
umask 077
printf '%s\n' "$TOKEN" > "$TOKEN_FILE"
chmod 0600 "$TOKEN_FILE"

cat > "$CADDYFILE" <<'EOF'
{
    admin off
}

pica.test {
    tls internal
    reverse_proxy pica:8787
}
EOF

export PICA_LIBRARY_IMAGE="$IMAGE"
export PICA_LIBRARY_DOMAIN="$DOMAIN"
export PICA_LIBRARY_REMOTE_TOKEN_FILE_HOST="$TOKEN_FILE"
export PICA_LIBRARY_CADDYFILE="$CADDYFILE"
export PICA_LIBRARY_BIND_ADDRESS="127.0.0.1"
export PICA_LIBRARY_HTTP_PORT="$HTTP_PORT"
export PICA_LIBRARY_HTTPS_PORT="$HTTPS_PORT"

CONFIG_JSON="$WORK/compose-config.json"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" config --format json > "$CONFIG_JSON"

node - "$CONFIG_JSON" "$TOKEN" <<'NODE'
const fs=require('fs')
const [file,token]=process.argv.slice(2)
const value=JSON.parse(fs.readFileSync(file,'utf8'))
const fail=(message)=>{throw new Error(message)}
const services=value.services||{}
const init=services['pica-init']||{}
const pica=services.pica||{}
const caddy=services.caddy||{}
if(init.network_mode!=='none')fail('init service must have no network')
if(init.user!=='0:0')fail('init service must run only its copy/chown step as root')
if(pica.user!=='10001:10001')fail('Pica service must be non-root 10001:10001')
if(pica.read_only!==true)fail('Pica application filesystem must be read-only')
if(!Array.isArray(pica.cap_drop)||!pica.cap_drop.includes('ALL'))fail('Pica service must drop all Linux capabilities')
if(!Array.isArray(pica.expose)||!pica.expose.map(String).includes('8787'))fail('Remote API container port is not declared')
if(Array.isArray(pica.ports)&&pica.ports.length)fail('Pica service must not publish a host port')
if(pica.environment?.PICA_LIBRARY_REMOTE_HOST!=='0.0.0.0')fail('Remote API bind host mismatch')
if(pica.environment?.PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY!=='true')fail('TLS proxy assertion missing')
if(pica.environment?.PICA_LIBRARY_REMOTE_TOKEN_FILE!=='/run/pica-secret/token')fail('runtime secret-file path mismatch')
if(!pica.depends_on?.['pica-init'])fail('Pica must wait for the init service')
if(!caddy.depends_on?.pica)fail('Caddy must depend on Pica health')
if(!Array.isArray(caddy.ports)||caddy.ports.length<3)fail('Caddy ingress ports missing')
if(!value.networks?.pica_backend?.internal)fail('Pica/Caddy backend network must be internal')
if(JSON.stringify(value).includes(token))fail('Bearer token leaked into rendered Compose config')
NODE

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d

INIT_ID="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps -aq pica-init)"
PICA_ID="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps -q pica)"
CADDY_ID="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps -q caddy)"
[[ -n "$INIT_ID" && -n "$PICA_ID" && -n "$CADDY_ID" ]] || fail "Compose did not create every required service"

if [[ "$(docker inspect "$INIT_ID" --format '{{.State.ExitCode}}')" != "0" ]]; then
  fail "one-shot init service did not exit successfully"
fi
if [[ "$(docker inspect "$PICA_ID" --format '{{.Config.User}}')" != "10001:10001" ]]; then
  fail "running Pica Compose service is not non-root"
fi
if [[ "$(docker inspect "$PICA_ID" --format '{{json .HostConfig.PortBindings}}')" != "{}" &&
      "$(docker inspect "$PICA_ID" --format '{{json .HostConfig.PortBindings}}')" != "null" ]]; then
  fail "Pica Compose service published a host port"
fi

SECRET_MODE="$(
  docker exec "$PICA_ID" /opt/pica/runtime/bin/node -e     "const fs=require('fs');const s=fs.statSync('/run/pica-secret/token');process.stdout.write((s.mode&0o777).toString(8)+' '+s.uid+' '+s.gid)"
)"
if [[ "$SECRET_MODE" != "600 10001 10001" ]]; then
  fail "runtime secret is not 0600 and owned by UID/GID 10001: $SECRET_MODE"
fi

for _ in $(seq 1 120); do
  PICA_HEALTH="$(docker inspect "$PICA_ID" --format '{{.State.Health.Status}}' 2>/dev/null || true)"
  if [[ "$PICA_HEALTH" == "healthy" ]]; then
    break
  fi
  if [[ "$(docker inspect "$PICA_ID" --format '{{.State.Running}}')" != "true" ]]; then
    fail "Pica Compose service exited during startup"
  fi
  sleep 0.25
done
[[ "$PICA_HEALTH" == "healthy" ]] || fail "Pica Compose service did not become healthy"

for _ in $(seq 1 120); do
  if ! docker inspect "$CADDY_ID" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
    fail "Caddy Compose service exited during startup"
  fi
  if docker exec "$CADDY_ID" test -s /data/caddy/pki/authorities/local/root.crt >/dev/null 2>&1; then
    docker cp "$CADDY_ID:/data/caddy/pki/authorities/local/root.crt" "$ROOT_CA" >/dev/null
    if curl --fail --silent --show-error --noproxy '*'       --cacert "$ROOT_CA"       --resolve "$DOMAIN:$HTTPS_PORT:127.0.0.1"       "https://$DOMAIN:$HTTPS_PORT/healthz" >/dev/null 2>&1; then
      break
    fi
  fi
  sleep 0.25
done
[[ -s "$ROOT_CA" ]] || fail "Caddy internal CA was not available in the Compose gate"

BASE="https://$DOMAIN:$HTTPS_PORT"
CURL_TLS=(
  --silent
  --show-error
  --noproxy '*'
  --cacert "$ROOT_CA"
  --resolve "$DOMAIN:$HTTPS_PORT:127.0.0.1"
)

HEALTH="$WORK/health.json"
curl --fail "${CURL_TLS[@]}" "$BASE/healthz" > "$HEALTH"
node - "$HEALTH" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(value.status!=='ok'||value.application!=='Pica Library'||value.remoteApiVersion!==1)
  throw new Error('Compose HTTPS health contract mismatch')
NODE

UNAUTH="$(
  curl "${CURL_TLS[@]}"     --output /dev/null     --write-out '%{http_code}'     "$BASE/api/v1/capabilities"
)"
[[ "$UNAUTH" == "401" ]] || fail "Compose HTTPS path did not require bearer auth: $UNAUTH"

CAPS="$WORK/capabilities.json"
curl --fail "${CURL_TLS[@]}"   -H "Authorization: Bearer $TOKEN"   "$BASE/api/v1/capabilities" > "$CAPS"
node - "$CAPS" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const fail=(message)=>{throw new Error(message)}
if(value.runtime?.role!=='server')fail('server role missing')
if(value.runtime?.mode!=='headless')fail('headless mode missing')
if(value.capabilityStates?.remoteApi?.available!==true)fail('Remote API is not available')
if(value.features?.remoteApi!==true)fail('Remote API compatibility flag missing')
if(value.features?.updatePackages!==false)fail('Linux server must not advertise self-update')
NODE

BLOCKED="$(
  curl "${CURL_TLS[@]}"     -H "Authorization: Bearer $TOKEN"     --output /dev/null     --write-out '%{http_code}'     "$BASE/api/v1/desktop/status"
)"
[[ "$BLOCKED" == "404" ]] || fail "Compose exposed Desktop management through Remote API: $BLOCKED"

if docker inspect "$PICA_ID" --format '{{json .Config.Env}}' | grep -F "$TOKEN" >/dev/null; then
  fail "bearer token leaked into Pica Compose environment"
fi
if docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color 2>&1 | grep -F "$TOKEN" >/dev/null; then
  fail "bearer token leaked into Compose logs"
fi

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" restart pica >/dev/null
PICA_ID="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps -q pica)"
for _ in $(seq 1 120); do
  PICA_HEALTH="$(docker inspect "$PICA_ID" --format '{{.State.Health.Status}}' 2>/dev/null || true)"
  if [[ "$PICA_HEALTH" == "healthy" ]]; then
    break
  fi
  sleep 0.25
done
[[ "$PICA_HEALTH" == "healthy" ]] || fail "Pica Compose service did not recover after restart"

RECOVERED=""
for _ in $(seq 1 120); do
  RECOVERED="$(
    curl "${CURL_TLS[@]}"       -H "Authorization: Bearer $TOKEN"       --output /dev/null       --write-out '%{http_code}'       "$BASE/api/v1/capabilities" 2>/dev/null || true
  )"
  [[ "$RECOVERED" == "200" ]] && break
  sleep 0.25
done
[[ "$RECOVERED" == "200" ]] || fail "Caddy/Pica Compose path did not recover after Pica restart"

echo "Server Compose preview acceptance: PASS"
