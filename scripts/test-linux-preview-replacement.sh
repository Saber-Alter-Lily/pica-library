#!/usr/bin/env bash
set -euo pipefail

BASELINE_ARCHIVE="${1:-}"
CANDIDATE_ARCHIVE="${2:-}"
if [[ -z "$BASELINE_ARCHIVE" || -z "$CANDIDATE_ARCHIVE" || ! -f "$BASELINE_ARCHIVE" || ! -f "$CANDIDATE_ARCHIVE" ]]; then
  echo "Usage: $0 <baseline-linux-preview.tar.gz> <candidate-linux-preview.tar.gz>" >&2
  exit 2
fi

WORK="$(mktemp -d)"
ENGINE_PID=""
URL=""
INSTALL_ROOT="$WORK/install"
DATA_HOME="$WORK/user-data"
DATA_SNAPSHOT="$WORK/pre-upgrade-data"
LOG="$WORK/engine.log"

cleanup() {
  if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "Linux preview replacement gate: $*" >&2
  [[ -f "$LOG" ]] && cat "$LOG" >&2 || true
  exit 1
}

extract_package() {
  local archive="$1"
  local destination="$2"
  mkdir -p "$destination"
  tar -xzf "$archive" -C "$destination"
  local root
  root="$(find "$destination" -mindepth 1 -maxdepth 1 -type d -name 'Pica-Library-*-linux-x64-experimental' -print -quit)"
  [[ -n "$root" ]] || fail "package root missing in $archive"
  printf '%s' "$root"
}

BASELINE_ROOT="$(extract_package "$BASELINE_ARCHIVE" "$WORK/baseline")"
CANDIDATE_ROOT="$(extract_package "$CANDIDATE_ARCHIVE" "$WORK/candidate")"
BASELINE_SHA="$(tr -d '\r\n' < "$BASELINE_ROOT/SOURCE_SHA.txt")"
CANDIDATE_SHA="$(tr -d '\r\n' < "$CANDIDATE_ROOT/SOURCE_SHA.txt")"
[[ "$BASELINE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "baseline SOURCE_SHA is invalid"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SOURCE_SHA is invalid"
[[ "$BASELINE_SHA" != "$CANDIDATE_SHA" ]] || fail "replacement gate requires distinct preview builds"

install_package() {
  local source="$1"
  rm -rf "$INSTALL_ROOT"
  mkdir -p "$INSTALL_ROOT"
  cp -a "$source"/. "$INSTALL_ROOT"/
}

wait_for_engine() {
  local instance="$DATA_HOME/runtime-state/instance.json"
  URL=""
  for _ in $(seq 1 120); do
    if [[ -f "$instance" ]]; then
      URL="$(
        "$INSTALL_ROOT/runtime/bin/node" -e           "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.url||''))}catch{}"           "$instance"
      )"
      if [[ -n "$URL" ]] && curl --fail --silent "$URL/api/v1/desktop/status" >/dev/null 2>&1; then
        return 0
      fi
    fi
    if [[ -n "$ENGINE_PID" ]] && ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      fail "engine exited during startup"
    fi
    sleep 0.25
  done
  fail "engine did not become healthy"
}

start_engine() {
  : > "$LOG"
  PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME" "$INSTALL_ROOT/pica-library" --headless >"$LOG" 2>&1 &
  ENGINE_PID="$!"
  wait_for_engine
}

stop_engine() {
  local status="$WORK/status.json"
  curl --fail --silent "$URL/api/v1/desktop/status" > "$status"
  local token
  token="$(
    "$INSTALL_ROOT/runtime/bin/node" -e       "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.csrfToken||''))"       "$status"
  )"
  [[ -n "$token" ]] || fail "Desktop CSRF token missing"
  curl --fail --silent     -X POST     -H "content-type: application/json"     -H "x-pica-csrf: $token"     -H "Origin: $URL"     --data '{}'     "$URL/api/v1/desktop/shutdown" >/dev/null
  for _ in $(seq 1 80); do
    if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      ENGINE_PID=""
      URL=""
      return 0
    fi
    sleep 0.25
  done
  fail "engine did not stop cleanly"
}

assert_json() {
  local file="$1"
  local mode="$2"
  "$INSTALL_ROOT/runtime/bin/node" - "$file" "$mode" <<'NODE'
const fs = require('fs')
const [file, mode] = process.argv.slice(2)
const value = JSON.parse(fs.readFileSync(file, 'utf8'))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
if (mode === 'query') {
  assert(value.total === 2, `expected two preview fixtures, got ${value.total}`)
} else if (mode === 'shelf') {
  assert(Array.isArray(value.items), 'shelf contents missing')
  assert(value.items.some((item) => item.comicId === 'linux-replace-1'), 'baseline shelf membership missing')
} else if (mode === 'downloads') {
  assert(Array.isArray(value), 'download list missing')
  assert(value.some((job) => job.comicId === 'linux-replace-1'), 'baseline download job missing')
} else if (mode === 'shelves-upgraded') {
  assert(Array.isArray(value), 'shelf list missing')
  assert(value.some((item) => item.name === 'Replacement Baseline'), 'baseline shelf lost during replacement')
  assert(value.some((item) => item.name === 'Candidate Marker'), 'candidate write did not persist')
} else if (mode === 'shelves-rolled-back') {
  assert(Array.isArray(value), 'shelf list missing')
  assert(value.some((item) => item.name === 'Replacement Baseline'), 'baseline shelf missing after rollback')
  assert(!value.some((item) => item.name === 'Candidate Marker'), 'rollback did not restore the pre-upgrade data snapshot')
} else {
  throw new Error(`unknown assertion mode: ${mode}`)
}
NODE
}

mkdir -p "$DATA_HOME/data"
FIXTURE="$WORK/favorites.csv"
cat > "$FIXTURE" <<'CSV'
comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count
linux-replace-1,Linux Replacement Fixture One,Preview Author,Drama,Preview | Replacement,true,12,120,24,1
linux-replace-2,Linux Replacement Fixture Two,Preview Author,Comedy,Preview | Rollback,false,8,80,18,1
CSV

install_package "$BASELINE_ROOT"
PICA_LIBRARY_HOME="$DATA_HOME/data"   "$INSTALL_ROOT/runtime/bin/node" "$INSTALL_ROOT/app/pica-library.js"   import "$FIXTURE" --data-dir "$DATA_HOME/data" --json > "$WORK/import.json"

start_engine
curl --fail --silent "$URL/api/v1/capabilities" > "$WORK/baseline-capabilities.json"
BASELINE_SCHEMA="$(
  "$INSTALL_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.databaseSchemaVersion||''))"     "$WORK/baseline-capabilities.json"
)"
[[ "$BASELINE_SCHEMA" =~ ^[0-9]+$ ]] || fail "baseline schema version missing"

curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"scope":"favorites","text":"Linux Replacement Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query-baseline.json"
assert_json "$WORK/query-baseline.json" query

curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"name":"Replacement Baseline"}'   "$URL/api/v1/shelves" > "$WORK/shelf-create.json"
SHELF_ID="$(
  "$INSTALL_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.id||''))"     "$WORK/shelf-create.json"
)"
[[ -n "$SHELF_ID" ]] || fail "baseline shelf id missing"

curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"comicIds":["linux-replace-1"]}'   "$URL/api/v1/shelves/$SHELF_ID/items" > "$WORK/shelf-add.json"
curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-baseline.json"
assert_json "$WORK/shelf-baseline.json" shelf

curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"comicIds":["linux-replace-1"],"source":"manual","run":false}'   "$URL/api/v1/download" > "$WORK/download-create.json"
curl --fail --silent "$URL/api/v1/downloads" > "$WORK/downloads-baseline.json"
assert_json "$WORK/downloads-baseline.json" downloads

stop_engine
cp -a "$DATA_HOME" "$DATA_SNAPSHOT"

install_package "$CANDIDATE_ROOT"
[[ "$(tr -d '\r\n' < "$INSTALL_ROOT/SOURCE_SHA.txt")" == "$CANDIDATE_SHA" ]] || fail "candidate application replacement did not take effect"

start_engine
curl --fail --silent "$URL/api/v1/capabilities" > "$WORK/candidate-capabilities.json"
CANDIDATE_SCHEMA="$(
  "$INSTALL_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.databaseSchemaVersion||''))"     "$WORK/candidate-capabilities.json"
)"
[[ "$CANDIDATE_SCHEMA" =~ ^[0-9]+$ ]] || fail "candidate schema version missing"
(( CANDIDATE_SCHEMA >= BASELINE_SCHEMA )) || fail "candidate schema unexpectedly moved backwards"

if (( CANDIDATE_SCHEMA > BASELINE_SCHEMA )); then
  [[ -f "$DATA_HOME/data/library.db.pre-migration-v${CANDIDATE_SCHEMA}.bak" ]] ||     fail "schema upgrade did not create the required pre-migration backup"
fi

curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"scope":"favorites","text":"Linux Replacement Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query-candidate.json"
assert_json "$WORK/query-candidate.json" query
curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-candidate.json"
assert_json "$WORK/shelf-candidate.json" shelf
curl --fail --silent "$URL/api/v1/downloads" > "$WORK/downloads-candidate.json"
assert_json "$WORK/downloads-candidate.json" downloads

curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"name":"Candidate Marker"}'   "$URL/api/v1/shelves" > "$WORK/candidate-marker.json"
curl --fail --silent "$URL/api/v1/shelves" > "$WORK/shelves-upgraded.json"
assert_json "$WORK/shelves-upgraded.json" shelves-upgraded

stop_engine

rm -rf "$DATA_HOME"
cp -a "$DATA_SNAPSHOT" "$DATA_HOME"
install_package "$BASELINE_ROOT"
[[ "$(tr -d '\r\n' < "$INSTALL_ROOT/SOURCE_SHA.txt")" == "$BASELINE_SHA" ]] || fail "baseline application rollback did not take effect"

start_engine
curl --fail --silent   -X POST -H "content-type: application/json" -H "Origin: $URL"   --data '{"scope":"favorites","text":"Linux Replacement Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query-rollback.json"
assert_json "$WORK/query-rollback.json" query
curl --fail --silent "$URL/api/v1/shelves" > "$WORK/shelves-rollback.json"
assert_json "$WORK/shelves-rollback.json" shelves-rolled-back
curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-rollback.json"
assert_json "$WORK/shelf-rollback.json" shelf
curl --fail --silent "$URL/api/v1/downloads" > "$WORK/downloads-rollback.json"
assert_json "$WORK/downloads-rollback.json" downloads
stop_engine

if find "$INSTALL_ROOT" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite' \) -print -quit | grep -q .; then
  fail "application replacement path contains user database state"
fi

echo "Linux preview replacement/rollback acceptance: PASS"
