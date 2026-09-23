#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <linux-experimental.tar.gz>" >&2
  exit 2
fi

WORK="$(mktemp -d)"
ENGINE_PID=""
PACKAGE_ROOT=""
DATA_HOME="$WORK/user-data"
LOG="$WORK/linux-preview.log"

cleanup() {
  if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "Linux preview acceptance: $*" >&2
  [[ -f "$LOG" ]] && cat "$LOG" >&2 || true
  exit 1
}

json_assert() {
  local file="$1"
  local source="$2"
  "$PACKAGE_ROOT/runtime/bin/node" - "$file" "$source" <<'NODE'
const fs = require('fs')
const [file, source] = process.argv.slice(2)
const value = JSON.parse(fs.readFileSync(file, 'utf8'))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const checks = {
  capabilities(v) {
    assert(v.runtime?.role === 'server', 'runtime role is not server')
    assert(v.runtime?.mode === 'headless', 'runtime mode is not headless')
    assert(v.runtime?.platform === 'linux', 'runtime platform is not linux')
    assert(v.runtime?.arch === 'x64', 'runtime architecture is not x64')
    assert(v.features?.updatePackages === false, 'Linux self-update was advertised')
    assert(v.capabilityStates?.selfUpdate?.available === false, 'Linux self-update became available')
    assert(v.capabilityStates?.selfUpdate?.execution === 'platform-host', 'self-update execution location missing')
  },
  query(v) {
    assert(v.total === 2, `expected 2 fixture comics, received ${v.total}`)
    assert(Array.isArray(v.items) && v.items.length === 2, 'fixture query did not return 2 items')
  },
  detail(v) {
    assert(v.comicId === 'linux-preview-1', 'detail returned the wrong comic')
    assert(v.title === 'Linux Preview Fixture One', 'detail title mismatch')
  },
  shelfCreate(v) {
    assert(typeof v.id === 'string' && v.id.length > 0, 'shelf id missing')
  },
  shelfAdd(v) {
    assert(Number(v.added) === 1, 'fixture comic was not added to shelf')
  },
  shelfContents(v) {
    assert(Array.isArray(v.items), 'shelf items missing')
    assert(v.items.some((item) => item.comicId === 'linux-preview-1'), 'fixture comic missing from shelf')
  },
  downloadQueued(v) {
    assert(Array.isArray(v) && v.length === 1, 'expected one queued download job')
    assert(v[0]?.status === 'QUEUED', 'download did not enter QUEUED state')
    assert(typeof v[0]?.id === 'string' && v[0].id.length > 0, 'download job id missing')
  },
  downloadPaused(v) {
    assert(v.status === 'PAUSED', 'download did not enter PAUSED state')
  },
  downloadResumed(v) {
    assert(v.status === 'QUEUED', 'download did not return to QUEUED state')
  },
  downloadsPersisted(v) {
    assert(Array.isArray(v), 'download list missing after restart')
    assert(v.some((job) => job.comicId === 'linux-preview-1' && job.status === 'QUEUED'), 'queued job did not persist across restart')
  },
  shelvesPersisted(v) {
    assert(Array.isArray(v), 'shelf list missing after restart')
    assert(v.some((shelf) => shelf.name === 'Linux Preview Acceptance'), 'shelf did not persist across restart')
  }
}
if (!checks[source]) throw new Error(`unknown assertion set: ${source}`)
checks[source](value)
NODE
}

wait_for_engine() {
  local instance="$DATA_HOME/runtime-state/instance.json"
  local url=""
  for _ in $(seq 1 120); do
    if [[ -f "$instance" ]]; then
      url="$(
        "$PACKAGE_ROOT/runtime/bin/node" -e           "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.url||''))}catch{}"           "$instance"
      )"
      if [[ -n "$url" ]] && curl --fail --silent "$url/api/v1/desktop/status" >/dev/null 2>&1; then
        printf '%s' "$url"
        return 0
      fi
    fi
    if [[ -n "$ENGINE_PID" ]] && ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      fail "Desktop engine exited during startup"
    fi
    sleep 0.25
  done
  fail "Desktop engine did not become healthy"
}

start_engine() {
  : > "$LOG"
  PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME"     "$PACKAGE_ROOT/pica-library" --headless >"$LOG" 2>&1 &
  ENGINE_PID="$!"
  wait_for_engine
}

stop_engine() {
  local url="$1"
  local status="$WORK/desktop-status.json"
  curl --fail --silent "$url/api/v1/desktop/status" > "$status"
  local token
  token="$(
    "$PACKAGE_ROOT/runtime/bin/node" -e       "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.csrfToken||''))"       "$status"
  )"
  [[ -n "$token" ]] || fail "Desktop CSRF token missing"
  curl --fail --silent     -X POST     -H "content-type: application/json"     -H "x-pica-csrf: $token"     -H "Origin: $url"     --data '{}'     "$url/api/v1/desktop/shutdown" >/dev/null

  for _ in $(seq 1 80); do
    if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      ENGINE_PID=""
      return 0
    fi
    sleep 0.25
  done
  fail "Desktop engine did not stop cleanly"
}

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(
  find "$WORK" -mindepth 1 -maxdepth 1 -type d     -name 'Pica-Library-*-linux-x64-experimental' -print -quit
)"
[[ -n "$PACKAGE_ROOT" ]] || fail "package root not found"

for required in   "$PACKAGE_ROOT/pica-library"   "$PACKAGE_ROOT/runtime/bin/node"   "$PACKAGE_ROOT/app/pica-library.js"   "$PACKAGE_ROOT/app/desktop.js"   "$PACKAGE_ROOT/web/index.html"
do
  [[ -s "$required" ]] || fail "package is missing $required"
done

mkdir -p "$DATA_HOME/data"
FIXTURE="$WORK/favorites.csv"
cat > "$FIXTURE" <<'CSV'
comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count
linux-preview-1,Linux Preview Fixture One,Preview Author,Drama,Preview | Stable,true,12,120,24,1
linux-preview-2,Linux Preview Fixture Two,Preview Author,Comedy,Preview | Portable,false,8,80,18,1
CSV

CLI_IMPORT="$WORK/cli-import.json"
PICA_LIBRARY_HOME="$DATA_HOME/data"   "$PACKAGE_ROOT/runtime/bin/node" "$PACKAGE_ROOT/app/pica-library.js"   import "$FIXTURE" --data-dir "$DATA_HOME/data" --json > "$CLI_IMPORT"

CLI_LIST="$WORK/cli-list.json"
PICA_LIBRARY_HOME="$DATA_HOME/data"   "$PACKAGE_ROOT/runtime/bin/node" "$PACKAGE_ROOT/app/pica-library.js"   list --data-dir "$DATA_HOME/data" --json > "$CLI_LIST"
"$PACKAGE_ROOT/runtime/bin/node" - "$CLI_LIST" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!Array.isArray(value)||value.length!==2)throw new Error('packaged CLI did not reopen the imported library')
NODE

URL="$(start_engine)"

curl --fail --silent "$URL/" > "$WORK/index.html"
grep -q "Pica Library" "$WORK/index.html" || fail "packaged Web UI was not served"

curl --fail --silent "$URL/api/v1/capabilities" > "$WORK/capabilities.json"
json_assert "$WORK/capabilities.json" capabilities

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"scope":"favorites","text":"Linux Preview Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query.json"
json_assert "$WORK/query.json" query

curl --fail --silent "$URL/api/v1/comics/linux-preview-1" > "$WORK/detail.json"
json_assert "$WORK/detail.json" detail

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"name":"Linux Preview Acceptance"}'   "$URL/api/v1/shelves" > "$WORK/shelf-create.json"
json_assert "$WORK/shelf-create.json" shelfCreate
SHELF_ID="$(
  "$PACKAGE_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(v.id)"     "$WORK/shelf-create.json"
)"

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"comicIds":["linux-preview-1"]}'   "$URL/api/v1/shelves/$SHELF_ID/items" > "$WORK/shelf-add.json"
json_assert "$WORK/shelf-add.json" shelfAdd

curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-contents.json"
json_assert "$WORK/shelf-contents.json" shelfContents

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"comicIds":["linux-preview-1"],"source":"manual","run":false}'   "$URL/api/v1/download" > "$WORK/download-queued.json"
json_assert "$WORK/download-queued.json" downloadQueued
JOB_ID="$(
  "$PACKAGE_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(v[0].id)"     "$WORK/download-queued.json"
)"

curl --fail --silent   -X POST -H "Origin: $URL"   "$URL/api/v1/downloads/$JOB_ID/pause" > "$WORK/download-paused.json"
json_assert "$WORK/download-paused.json" downloadPaused

curl --fail --silent   -X POST -H "Origin: $URL"   "$URL/api/v1/downloads/$JOB_ID/resume" > "$WORK/download-resumed.json"
json_assert "$WORK/download-resumed.json" downloadResumed

stop_engine "$URL"

[[ -f "$DATA_HOME/data/library.db" ]] || fail "database was not persisted outside the package"

URL="$(start_engine)"

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"scope":"favorites","text":"Linux Preview Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query-after-restart.json"
json_assert "$WORK/query-after-restart.json" query

curl --fail --silent "$URL/api/v1/shelves" > "$WORK/shelves-after-restart.json"
json_assert "$WORK/shelves-after-restart.json" shelvesPersisted

curl --fail --silent "$URL/api/v1/downloads" > "$WORK/downloads-after-restart.json"
json_assert "$WORK/downloads-after-restart.json" downloadsPersisted

curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-after-restart.json"
json_assert "$WORK/shelf-after-restart.json" shelfContents

stop_engine "$URL"

if find "$PACKAGE_ROOT" -type f (   -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite' ) -print -quit | grep -q .; then
  fail "preview flow wrote user state into the application package"
fi

echo "Linux x64 preview vertical acceptance: PASS"
