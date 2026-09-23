#!/usr/bin/env bash
set -euo pipefail

BASELINE_IMAGE="${1:-}"
CANDIDATE_IMAGE="${2:-}"
CADDY_IMAGE="${PICA_LIBRARY_CADDY_IMAGE:-caddy:2.11.4-alpine}"
TOKEN="w4b-image-replacement-token-0123456789abcdef"

if [[ -z "$BASELINE_IMAGE" || -z "$CANDIDATE_IMAGE" ]]; then
  echo "Usage: $0 <baseline-image-tag> <candidate-image-tag>" >&2
  exit 2
fi
if [[ "$BASELINE_IMAGE" == "$CANDIDATE_IMAGE" ]]; then
  echo "Replacement gate requires distinct baseline and candidate images" >&2
  exit 2
fi

SUFFIX="$$"
PICA_NAME="pica-library-replace-$SUFFIX"
CADDY_NAME="pica-library-replace-caddy-$SUFFIX"
NETWORK="pica-library-replace-net-$SUFFIX"
CONFIG_VOLUME="pica-library-replace-config-$SUFFIX"
SECRET_VOLUME="pica-library-replace-secret-$SUFFIX"
CADDY_DATA_VOLUME="pica-library-replace-caddy-data-$SUFFIX"
CADDY_CONFIG_VOLUME="pica-library-replace-caddy-config-$SUFFIX"
WORK="$(mktemp -d)"
FIXTURE="$WORK/favorites.csv"
SNAPSHOT="$WORK/config-before-candidate.tar.gz"
CADDYFILE="$WORK/Caddyfile"
ROOT_CA="$WORK/caddy-root.crt"
HOST_PORT=""
BASE=""

cleanup() {
  docker rm -f "$CADDY_NAME" "$PICA_NAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  docker volume rm -f     "$CONFIG_VOLUME"     "$SECRET_VOLUME"     "$CADDY_DATA_VOLUME"     "$CADDY_CONFIG_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "Docker image replacement gate: $*" >&2
  echo "----- Pica logs -----" >&2
  docker logs "$PICA_NAME" >&2 2>/dev/null || true
  echo "----- Caddy logs -----" >&2
  docker logs "$CADDY_NAME" >&2 2>/dev/null || true
  exit 1
}

for image in "$BASELINE_IMAGE" "$CANDIDATE_IMAGE"; do
  docker image inspect "$image" >/dev/null
  if [[ "$(docker image inspect "$image" --format '{{.Config.User}}')" != "10001:10001" ]]; then
    fail "image is not configured for UID/GID 10001: $image"
  fi
done

BASELINE_SHA="$(
  docker run --rm --entrypoint /opt/pica/runtime/bin/node "$BASELINE_IMAGE" -e     "process.stdout.write(require('fs').readFileSync('/opt/pica/SOURCE_SHA.txt','utf8').trim())"
)"
CANDIDATE_SHA="$(
  docker run --rm --entrypoint /opt/pica/runtime/bin/node "$CANDIDATE_IMAGE" -e     "process.stdout.write(require('fs').readFileSync('/opt/pica/SOURCE_SHA.txt','utf8').trim())"
)"
[[ "$BASELINE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "baseline SOURCE_SHA is invalid"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SOURCE_SHA is invalid"
[[ "$BASELINE_SHA" != "$CANDIDATE_SHA" ]] || fail "replacement gate requires distinct source builds"

docker pull --quiet "$CADDY_IMAGE" >/dev/null
docker network create "$NETWORK" >/dev/null
docker volume create "$CONFIG_VOLUME" >/dev/null
docker volume create "$SECRET_VOLUME" >/dev/null
docker volume create "$CADDY_DATA_VOLUME" >/dev/null
docker volume create "$CADDY_CONFIG_VOLUME" >/dev/null

docker run --rm   --user 0   --entrypoint /bin/sh   --mount "type=volume,src=$CONFIG_VOLUME,dst=/config"   "$CANDIDATE_IMAGE"   -c 'set -eu; chown 10001:10001 /config; chmod 0700 /config'

printf '%s' "$TOKEN" | docker run --rm -i   --user 0   --entrypoint /bin/sh   --mount "type=volume,src=$SECRET_VOLUME,dst=/secret"   "$CANDIDATE_IMAGE"   -c 'set -eu; umask 077; cat > /secret/token; chown 10001:10001 /secret/token; chmod 0600 /secret/token'

cat > "$FIXTURE" <<'CSV'
comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count
docker-replace-1,Docker Replacement Fixture One,Server Preview Author,Drama,Server | Replacement,true,14,140,24,1
docker-replace-2,Docker Replacement Fixture Two,Server Preview Author,Comedy,Server | Rollback,false,9,90,18,1
CSV

docker run --rm   --network none   --mount "type=volume,src=$CONFIG_VOLUME,dst=/config"   --mount "type=bind,src=$FIXTURE,dst=/tmp/favorites.csv,readonly"   --entrypoint /opt/pica/runtime/bin/node   "$BASELINE_IMAGE"   /opt/pica/app/pica-library.js import /tmp/favorites.csv   --data-dir /config/data --json > "$WORK/import.json"

cat > "$CADDYFILE" <<'EOF'
{
    admin off
}

pica.test {
    tls internal
    reverse_proxy pica:8787
}
EOF

start_pica() {
  local image="$1"
  docker run --detach     --name "$PICA_NAME"     --network "$NETWORK"     --network-alias pica     --mount "type=volume,src=$CONFIG_VOLUME,dst=/config"     --mount "type=volume,src=$SECRET_VOLUME,dst=/run/pica-secret,readonly"     -e PICA_LIBRARY_REMOTE_TOKEN_FILE=/run/pica-secret/token     -e PICA_LIBRARY_REMOTE_HOST=0.0.0.0     -e PICA_LIBRARY_REMOTE_PORT=8787     -e PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY=true     -e PICA_LIBRARY_REMOTE_ALLOWED_HOSTS=pica.test,127.0.0.1     "$image"     --remote-api >/dev/null

  if [[ -n "$(docker port "$PICA_NAME" 2>/dev/null)" ]]; then
    fail "Pica image published the Remote API directly"
  fi

  local status=""
  for _ in $(seq 1 120); do
    if ! docker inspect "$PICA_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
      fail "Pica image exited during startup"
    fi
    status="$(
      docker exec "$PICA_NAME" /opt/pica/runtime/bin/node -e         "fetch('http://127.0.0.1:8787/healthz').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))"         2>/dev/null || true
    )"
    if [[ "$status" == "200" ]]; then
      return 0
    fi
    sleep 0.25
  done
  fail "Pica Remote API did not become healthy"
}

stop_pica() {
  docker stop --time 10 "$PICA_NAME" >/dev/null
  if [[ "$(docker inspect "$PICA_NAME" --format '{{.State.ExitCode}}')" != "0" ]]; then
    fail "Pica image did not stop cleanly"
  fi
  docker rm "$PICA_NAME" >/dev/null
}

start_caddy() {
  docker run --detach     --name "$CADDY_NAME"     --network "$NETWORK"     -p 127.0.0.1::443     --mount "type=bind,src=$CADDYFILE,dst=/etc/caddy/Caddyfile,readonly"     --mount "type=volume,src=$CADDY_DATA_VOLUME,dst=/data"     --mount "type=volume,src=$CADDY_CONFIG_VOLUME,dst=/config"     "$CADDY_IMAGE" >/dev/null

  local mapping
  mapping="$(docker port "$CADDY_NAME" 443/tcp | head -n 1)"
  HOST_PORT="${mapping##*:}"
  [[ "$HOST_PORT" =~ ^[0-9]+$ ]] || fail "Caddy HTTPS port was not published"
  BASE="https://pica.test:$HOST_PORT"

  for _ in $(seq 1 120); do
    if ! docker inspect "$CADDY_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
      fail "Caddy exited during startup"
    fi
    if docker exec "$CADDY_NAME" test -s /data/caddy/pki/authorities/local/root.crt >/dev/null 2>&1; then
      docker cp "$CADDY_NAME:/data/caddy/pki/authorities/local/root.crt" "$ROOT_CA" >/dev/null
      if remote_status /healthz "" == "200"; then
        return 0
      fi
    fi
    sleep 0.25
  done
  fail "Caddy TLS ingress did not become healthy"
}

refresh_caddy() {
  docker restart "$CADDY_NAME" >/dev/null
  for _ in $(seq 1 120); do
    if remote_status /healthz "" == "200"; then
      return 0
    fi
    sleep 0.25
  done
  fail "Caddy did not recover after application image switch"
}

remote_status() {
  local path="$1"
  local auth="${2:-yes}"
  local args=(
    --silent
    --show-error
    --noproxy '*'
    --cacert "$ROOT_CA"
    --resolve "pica.test:$HOST_PORT:127.0.0.1"
    --output /dev/null
    --write-out '%{http_code}'
  )
  if [[ "$auth" != "" ]]; then
    args+=(-H "Authorization: Bearer $TOKEN")
  fi
  curl "${args[@]}" "$BASE$path" 2>/dev/null || true
}

remote_get() {
  local path="$1"
  curl --fail --silent --show-error --noproxy '*'     --cacert "$ROOT_CA"     --resolve "pica.test:$HOST_PORT:127.0.0.1"     -H "Authorization: Bearer $TOKEN"     "$BASE$path"
}

remote_post() {
  local path="$1"
  local payload="$2"
  curl --fail --silent --show-error --noproxy '*'     --cacert "$ROOT_CA"     --resolve "pica.test:$HOST_PORT:127.0.0.1"     -X POST     -H "Authorization: Bearer $TOKEN"     -H "content-type: application/json"     --data "$payload"     "$BASE$path"
}

local_api() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  docker exec -i "$PICA_NAME" /opt/pica/runtime/bin/node - "$method" "$path" "$payload" <<'NODE'
const fs=require('fs')
const [method,path,payload]=process.argv.slice(2)
const instance=JSON.parse(fs.readFileSync('/config/runtime-state/instance.json','utf8'))
const options={method,headers:{}}
if(payload){
  options.headers['content-type']='application/json'
  options.body=payload
}
const response=await fetch(instance.url+path,options)
const text=await response.text()
if(!response.ok){
  console.error(text)
  process.exit(1)
}
process.stdout.write(text)
NODE
}

assert_query() {
  local file="$1"
  node - "$file" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(value.total!==2)throw new Error(`expected two Docker replacement fixtures, got ${value.total}`)
NODE
}

assert_shelf_contents() {
  local file="$1"
  node - "$file" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!Array.isArray(value.items))throw new Error('shelf contents missing')
if(!value.items.some(item=>item.comicId==='docker-replace-1'))
  throw new Error('baseline shelf membership missing')
NODE
}

assert_download_state() {
  local file="$1"
  node - "$file" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!Array.isArray(value))throw new Error('download job list missing')
if(!value.some(job=>job.comicId==='docker-replace-1'))
  throw new Error('baseline download job missing')
NODE
}

start_pica "$BASELINE_IMAGE"
start_caddy

remote_post /api/v1/library/query   '{"scope":"favorites","text":"Docker Replacement Fixture","limit":20}'   > "$WORK/query-baseline.json"
assert_query "$WORK/query-baseline.json"

local_api POST /api/v1/shelves '{"name":"Docker Baseline State"}' > "$WORK/shelf-create.json"
SHELF_ID="$(
  node -e "const v=require(process.argv[1]);process.stdout.write(String(v.id||''))" "$WORK/shelf-create.json"
)"
[[ -n "$SHELF_ID" ]] || fail "baseline shelf id missing"
local_api POST "/api/v1/shelves/$SHELF_ID/items" '{"comicIds":["docker-replace-1"]}' >/dev/null
remote_get "/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-baseline.json"
assert_shelf_contents "$WORK/shelf-baseline.json"

local_api POST /api/v1/download   '{"comicIds":["docker-replace-1"],"source":"manual","run":false}'   > "$WORK/download-create.json"
local_api GET /api/v1/downloads > "$WORK/downloads-baseline.json"
assert_download_state "$WORK/downloads-baseline.json"

remote_get /api/v1/capabilities > "$WORK/capabilities-baseline.json"
BASELINE_SCHEMA="$(
  node -e "const v=require(process.argv[1]);process.stdout.write(String(v.databaseSchemaVersion||''))"     "$WORK/capabilities-baseline.json"
)"
[[ "$BASELINE_SCHEMA" =~ ^[0-9]+$ ]] || fail "baseline schema version missing"

RUNNING_BASELINE_SHA="$(docker exec "$PICA_NAME" cat /opt/pica/SOURCE_SHA.txt | tr -d '\r\n')"
[[ "$RUNNING_BASELINE_SHA" == "$BASELINE_SHA" ]] || fail "wrong baseline image is running"

stop_pica

docker run --rm   --user 0   --entrypoint /bin/sh   --mount "type=volume,src=$CONFIG_VOLUME,dst=/config,readonly"   --mount "type=bind,src=$WORK,dst=/backup"   "$CANDIDATE_IMAGE"   -c 'set -eu; tar -C /config -czf /backup/config-before-candidate.tar.gz .'
[[ -s "$SNAPSHOT" ]] || fail "pre-candidate config snapshot was not created"

start_pica "$CANDIDATE_IMAGE"
refresh_caddy

remote_post /api/v1/library/query   '{"scope":"favorites","text":"Docker Replacement Fixture","limit":20}'   > "$WORK/query-candidate.json"
assert_query "$WORK/query-candidate.json"
remote_get "/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-candidate.json"
assert_shelf_contents "$WORK/shelf-candidate.json"
local_api GET /api/v1/downloads > "$WORK/downloads-candidate.json"
assert_download_state "$WORK/downloads-candidate.json"

remote_get /api/v1/capabilities > "$WORK/capabilities-candidate.json"
CANDIDATE_SCHEMA="$(
  node -e "const v=require(process.argv[1]);process.stdout.write(String(v.databaseSchemaVersion||''))"     "$WORK/capabilities-candidate.json"
)"
[[ "$CANDIDATE_SCHEMA" =~ ^[0-9]+$ ]] || fail "candidate schema version missing"
(( CANDIDATE_SCHEMA >= BASELINE_SCHEMA )) || fail "candidate schema unexpectedly moved backwards"
if (( CANDIDATE_SCHEMA > BASELINE_SCHEMA )); then
  if ! docker exec "$PICA_NAME" test -f "/config/data/library.db.pre-migration-v${CANDIDATE_SCHEMA}.bak"; then
    fail "schema-changing candidate did not create a pre-migration database backup"
  fi
fi

RUNNING_CANDIDATE_SHA="$(docker exec "$PICA_NAME" cat /opt/pica/SOURCE_SHA.txt | tr -d '\r\n')"
[[ "$RUNNING_CANDIDATE_SHA" == "$CANDIDATE_SHA" ]] || fail "candidate image replacement did not take effect"

local_api POST /api/v1/shelves '{"name":"Docker Candidate Marker"}' >/dev/null
remote_get /api/v1/shelves > "$WORK/shelves-candidate.json"
node - "$WORK/shelves-candidate.json" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!Array.isArray(value)||!value.some(item=>item.name==='Docker Baseline State'))
  throw new Error('baseline state was lost after candidate image switch')
if(!value.some(item=>item.name==='Docker Candidate Marker'))
  throw new Error('candidate-only marker was not written')
NODE

stop_pica

docker run --rm   --user 0   --entrypoint /bin/sh   --mount "type=volume,src=$CONFIG_VOLUME,dst=/config"   --mount "type=bind,src=$WORK,dst=/backup,readonly"   "$BASELINE_IMAGE"   -c 'set -eu; find /config -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf /backup/config-before-candidate.tar.gz -C /config; chown -R 10001:10001 /config; chmod 0700 /config'

start_pica "$BASELINE_IMAGE"
refresh_caddy

remote_post /api/v1/library/query   '{"scope":"favorites","text":"Docker Replacement Fixture","limit":20}'   > "$WORK/query-rollback.json"
assert_query "$WORK/query-rollback.json"
remote_get "/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-rollback.json"
assert_shelf_contents "$WORK/shelf-rollback.json"
local_api GET /api/v1/downloads > "$WORK/downloads-rollback.json"
assert_download_state "$WORK/downloads-rollback.json"

remote_get /api/v1/shelves > "$WORK/shelves-rollback.json"
node - "$WORK/shelves-rollback.json" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!Array.isArray(value)||!value.some(item=>item.name==='Docker Baseline State'))
  throw new Error('baseline shelf missing after image rollback')
if(value.some(item=>item.name==='Docker Candidate Marker'))
  throw new Error('candidate-only state survived restored rollback snapshot')
NODE

remote_get /api/v1/capabilities > "$WORK/capabilities-rollback.json"
ROLLBACK_SCHEMA="$(
  node -e "const v=require(process.argv[1]);process.stdout.write(String(v.databaseSchemaVersion||''))"     "$WORK/capabilities-rollback.json"
)"
[[ "$ROLLBACK_SCHEMA" == "$BASELINE_SCHEMA" ]] || fail "rollback did not restore the baseline schema view"
RUNNING_ROLLBACK_SHA="$(docker exec "$PICA_NAME" cat /opt/pica/SOURCE_SHA.txt | tr -d '\r\n')"
[[ "$RUNNING_ROLLBACK_SHA" == "$BASELINE_SHA" ]] || fail "baseline image rollback did not take effect"

if [[ -n "$(docker port "$PICA_NAME" 2>/dev/null)" ]]; then
  fail "rolled-back Pica image published a host port"
fi

echo "Docker image replacement/rollback acceptance: PASS"
