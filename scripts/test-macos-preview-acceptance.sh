#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <macos-experimental.tar.gz>" >&2
  exit 2
fi
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "macOS arm64 preview acceptance requires an Apple Silicon macOS runner" >&2
  exit 1
fi

WORK="$(mktemp -d)"
ENGINE_PID=""
PACKAGE_ROOT=""
DATA_HOME="$WORK/user-data"
LOG="$WORK/macos-preview.log"
URL=""
KEYCHAIN="$WORK/pica-preview.keychain-db"
KEYCHAIN_PASSWORD="pica-preview-ci-keychain-password"
KEYCHAIN_SERVICE="org.picalibrary.desktop"
KEYCHAIN_ACCOUNT="desktop-credentials"
ORIGINAL_DEFAULT=""
ORIGINAL_KEYCHAINS=()

cleanup() {
  if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
  security delete-generic-password     -a "$KEYCHAIN_ACCOUNT"     -s "$KEYCHAIN_SERVICE"     "$KEYCHAIN" >/dev/null 2>&1 || true
  if [[ -n "$ORIGINAL_DEFAULT" ]]; then
    security default-keychain -d user -s "$ORIGINAL_DEFAULT" >/dev/null 2>&1 || true
  fi
  if [[ "${#ORIGINAL_KEYCHAINS[@]}" -gt 0 ]]; then
    security list-keychains -d user -s "${ORIGINAL_KEYCHAINS[@]}" >/dev/null 2>&1 || true
  fi
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "macOS arm64 preview acceptance: $*" >&2
  [[ -f "$LOG" ]] && cat "$LOG" >&2 || true
  exit 1
}

json_assert() {
  local file="$1"
  local source="$2"
  "$PACKAGE_ROOT/runtime/bin/node" - "$file" "$source" <<'NODE'
const fs=require('fs')
const [file,source]=process.argv.slice(2)
const value=JSON.parse(fs.readFileSync(file,'utf8'))
const assert=(condition,message)=>{if(!condition)throw new Error(message)}
const checks={
  capabilities(v){
    assert(v.runtime?.role==='server','runtime role is not server')
    assert(v.runtime?.mode==='headless','runtime mode is not headless')
    assert(v.runtime?.platform==='macos','runtime platform is not macos')
    assert(v.runtime?.arch==='arm64','runtime architecture is not arm64')
    assert(v.features?.updatePackages===false,'macOS self-update was advertised')
    assert(v.capabilityStates?.selfUpdate?.available===false,'macOS self-update became available')
    assert(v.capabilityStates?.secureCredentialPersistence?.available===true,'Keychain capability is not available')
    assert(v.capabilityStates?.nativeFolderPicker?.available===true,'native folder picker capability is not available')
    assert(v.capabilityStates?.nativeSavePicker?.available===true,'native save picker capability is not available')
  },
  statusKeychain(v){
    assert(v.platform?.id==='macos','Desktop status platform mismatch')
    assert(v.platform?.arch==='arm64','Desktop status architecture mismatch')
    assert(v.credentialBackend?.kind==='macos-keychain','macOS Keychain backend missing')
    assert(v.credentialBackend?.securePersistence===true,'macOS Keychain did not report secure persistence')
    assert(v.credentialBackend?.sessionOnly===false,'macOS Keychain was reported as session-only')
    assert(v.nativePicker?.backend==='macos-osascript','macOS native picker backend missing')
  },
  configured(v){
    assert(v.configured===true,'Keychain-backed credentials did not configure the process')
    assert(v.credentialBackend?.kind==='macos-keychain','credential backend changed after save')
  },
  query(v){
    assert(v.total===2,`expected 2 fixture comics, received ${v.total}`)
    assert(Array.isArray(v.items)&&v.items.length===2,'fixture query did not return 2 items')
  },
  detail(v){
    assert(v.comicId==='macos-preview-1','detail returned the wrong comic')
    assert(v.title==='macOS Preview Fixture One','detail title mismatch')
  },
  shelfCreate(v){
    assert(typeof v.id==='string'&&v.id.length>0,'shelf id missing')
  },
  shelfAdd(v){
    assert(Number(v.added)===1,'fixture comic was not added to shelf')
  },
  shelfContents(v){
    assert(Array.isArray(v.items),'shelf items missing')
    assert(v.items.some(item=>item.comicId==='macos-preview-1'),'fixture comic missing from shelf')
  },
  shelvesPersisted(v){
    assert(Array.isArray(v),'shelf list missing after restart')
    assert(v.some(shelf=>shelf.name==='macOS Preview Acceptance'),'shelf did not persist across restart')
  },
  readerChapters(v){
    assert(Array.isArray(v),'reader chapter list missing')
    assert(v.some(ep=>ep.id==='macos-preview-ep-1'&&ep.downloadedPictures===1),'downloaded reader chapter missing')
  },
  readerChapter(v){
    assert(v.episode?.id==='macos-preview-ep-1','reader opened the wrong episode')
    assert(Array.isArray(v.pages)&&v.pages.length===1,'reader page list mismatch')
    assert(v.pages[0]?.id==='macos-preview-pic-1','reader returned the wrong page')
  },
  readerProgressSaved(v){
    assert(v.comicId==='macos-preview-1','reader progress comic mismatch')
    assert(v.episodeId==='macos-preview-ep-1','reader progress episode mismatch')
    assert(v.pageIndex===0,'reader progress page mismatch')
  },
  readerProgressPersisted(v){
    assert(Array.isArray(v),'reader progress list missing after restart')
    assert(v.some(row=>row.comicId==='macos-preview-1'&&row.episodeId==='macos-preview-ep-1'&&row.pageIndex===0),'reader progress did not persist across restart')
  },
  readerChapterResumed(v){
    assert(v.progress?.pageIndex===0,'reader chapter did not restore saved progress')
  },
  downloadQueued(v){
    assert(Array.isArray(v)&&v.length===1,'expected one queued download job')
    assert(v[0]?.status==='QUEUED','download did not enter QUEUED state')
    assert(typeof v[0]?.id==='string'&&v[0].id.length>0,'download job id missing')
  },
  downloadPaused(v){
    assert(v.status==='PAUSED','download did not enter PAUSED state')
  },
  downloadResumed(v){
    assert(v.status==='QUEUED','download did not return to QUEUED state')
  },
  downloadsPersisted(v){
    assert(Array.isArray(v),'download list missing after restart')
    assert(v.some(job=>job.comicId==='macos-preview-1'&&job.status==='PAUSED'),'graceful shutdown did not persist the local job as PAUSED')
  }
}
if(!checks[source])throw new Error(`unknown assertion set: ${source}`)
checks[source](value)
NODE
}

wait_for_engine() {
  local instance="$DATA_HOME/runtime-state/instance.json"
  local url=""
  for _ in $(seq 1 160); do
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
  URL="$(wait_for_engine)"
}

wait_for_engine_restart() {
  local old_token="$1"
  local instance="$DATA_HOME/runtime-state/instance.json"
  local status_file="$WORK/status-after-settings-restart.json"
  for _ in $(seq 1 200); do
    local candidate=""
    if [[ -f "$instance" ]]; then
      candidate="$(
        "$PACKAGE_ROOT/runtime/bin/node" -e           "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.url||''))}catch{}"           "$instance"
      )"
    fi
    if [[ -n "$candidate" ]] && curl --fail --silent "$candidate/api/v1/desktop/status" > "$status_file" 2>/dev/null; then
      local new_token=""
      new_token="$(
        "$PACKAGE_ROOT/runtime/bin/node" -e           "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.csrfToken||''))"           "$status_file"
      )"
      if [[ -n "$new_token" && "$new_token" != "$old_token" ]]; then
        URL="$candidate"
        return 0
      fi
    fi
    if [[ -n "$ENGINE_PID" ]] && ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      fail "Desktop engine exited during settings restart"
    fi
    sleep 0.25
  done
  fail "Desktop engine did not complete the settings restart"
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

  for _ in $(seq 1 100); do
    if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      ENGINE_PID=""
      return 0
    fi
    sleep 0.25
  done
  fail "Desktop engine did not stop cleanly"
}

# Isolate the Keychain test from the hosted runner's normal login keychain.
ORIGINAL_DEFAULT="$(
  security default-keychain -d user 2>/dev/null |
    sed -E 's/^[[:space:]]*"//;s/"[[:space:]]*$//'
)"
while IFS= read -r line; do
  keychain="$(
    printf '%s' "$line" |
      sed -E 's/^[[:space:]]*"//;s/"[[:space:]]*$//'
  )"
  [[ -n "$keychain" ]] && ORIGINAL_KEYCHAINS+=("$keychain")
done < <(security list-keychains -d user)

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
if [[ "${#ORIGINAL_KEYCHAINS[@]}" -gt 0 ]]; then
  security list-keychains -d user -s "$KEYCHAIN" "${ORIGINAL_KEYCHAINS[@]}"
else
  security list-keychains -d user -s "$KEYCHAIN"
fi
security default-keychain -d user -s "$KEYCHAIN"

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(
  find "$WORK" -mindepth 1 -maxdepth 1 -type d     -name 'Pica-Library-*-macos-arm64-experimental' -print | head -n 1
)"
[[ -n "$PACKAGE_ROOT" ]] || fail "package root not found"

for required in   "$PACKAGE_ROOT/pica-library"   "$PACKAGE_ROOT/Pica Library.command"   "$PACKAGE_ROOT/runtime/bin/node"   "$PACKAGE_ROOT/app/pica-library.js"   "$PACKAGE_ROOT/app/desktop.js"   "$PACKAGE_ROOT/web/index.html"   "$PACKAGE_ROOT/SOURCE_SHA.txt"
do
  [[ -s "$required" ]] || fail "package is missing $required"
done

DARWIN_MIN="$(
  otool -l "$PACKAGE_ROOT/runtime/bin/node" |
    awk '/LC_BUILD_VERSION/{found=1;next} found&&/minos/{print $2;exit}'
)"
[[ -n "$DARWIN_MIN" ]] || fail "bundled Node runtime did not expose LC_BUILD_VERSION minos"
if ! "$PACKAGE_ROOT/runtime/bin/node" - "$DARWIN_MIN" <<'NODE'
const value=process.argv[2].split('.').map(Number)
const minimum=[13,5]
for(let i=0;i<minimum.length;i++){
  const left=value[i]||0
  const right=minimum[i]
  if(left>right)process.exit(0)
  if(left<right)process.exit(1)
}
NODE
then
  fail "bundled Node runtime targets macOS below the declared 13.5 baseline: $DARWIN_MIN"
fi

mkdir -p "$DATA_HOME/data"
FIXTURE="$WORK/favorites.csv"
cat > "$FIXTURE" <<'CSV'
comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count
macos-preview-1,macOS Preview Fixture One,Preview Author,Drama,Preview | Stable,true,12,120,24,1
macos-preview-2,macOS Preview Fixture Two,Preview Author,Comedy,Preview | Portable,false,8,80,18,1
CSV

PICA_LIBRARY_HOME="$DATA_HOME/data"   "$PACKAGE_ROOT/runtime/bin/node" "$PACKAGE_ROOT/app/pica-library.js"   import "$FIXTURE" --data-dir "$DATA_HOME/data" --json > "$WORK/cli-import.json"

PICA_LIBRARY_HOME="$DATA_HOME/data"   "$PACKAGE_ROOT/runtime/bin/node" "$PACKAGE_ROOT/app/pica-library.js"   list --data-dir "$DATA_HOME/data" --json > "$WORK/cli-list.json"
"$PACKAGE_ROOT/runtime/bin/node" - "$WORK/cli-list.json" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!Array.isArray(value)||value.length!==2)
  throw new Error('packaged CLI did not reopen the imported library')
NODE

PAGE_FILE="$DATA_HOME/data/macos-preview-reader.png"
"$PACKAGE_ROOT/runtime/bin/node" - "$DATA_HOME/data/library.db" "$PAGE_FILE" <<'NODE'
const fs=require('fs')
const crypto=require('crypto')
const {DatabaseSync}=require('node:sqlite')
const [databaseFile,pageFile]=process.argv.slice(2)
const png=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO0sAAAAASUVORK5CYII=',
  'base64'
)
fs.writeFileSync(pageFile,png)
const db=new DatabaseSync(databaseFile)
const now=new Date().toISOString()
db.prepare(
  `INSERT INTO episodes(id, comic_id, title, order_no, updated_at_source, first_seen_at, last_seen_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run('macos-preview-ep-1','macos-preview-1','Preview Chapter',1,now,now,now)
db.prepare(
  `INSERT INTO pictures(id, comic_id, episode_id, position, original_name, media_path, file_server, first_seen_at, last_seen_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  'macos-preview-pic-1',
  'macos-preview-1',
  'macos-preview-ep-1',
  1,
  'macos-preview-reader.png',
  'macos-preview-reader.png',
  'https://fixture.invalid',
  now,
  now
)
db.prepare(
  `UPDATE pictures
   SET status='completed', local_path=?, byte_size=?, sha256=?, last_seen_at=?
   WHERE id=?`
).run(
  pageFile,
  png.length,
  crypto.createHash('sha256').update(png).digest('hex'),
  now,
  'macos-preview-pic-1'
)
db.close()
NODE

start_engine

curl --fail --silent "$URL/" > "$WORK/index.html"
grep -q "Pica Library" "$WORK/index.html" || fail "packaged Web UI was not served"

curl --fail --silent "$URL/api/v1/capabilities" > "$WORK/capabilities.json"
json_assert "$WORK/capabilities.json" capabilities
curl --fail --silent "$URL/api/v1/desktop/status" > "$WORK/status-before-keychain.json"
json_assert "$WORK/status-before-keychain.json" statusKeychain

TOKEN="$(
  "$PACKAGE_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.csrfToken||''))"     "$WORK/status-before-keychain.json"
)"
LIBRARY_DIRECTORY="$(
  "$PACKAGE_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.libraryDirectory||''))"     "$WORK/status-before-keychain.json"
)"
[[ -n "$TOKEN" && -n "$LIBRARY_DIRECTORY" ]] || fail "Keychain credential setup metadata missing"

"$PACKAGE_ROOT/runtime/bin/node" - "$LIBRARY_DIRECTORY" > "$WORK/keychain-settings.json" <<'NODE'
const libraryDirectory=process.argv[2]
process.stdout.write(JSON.stringify({
  account:'macos-preview-keychain-account',
  password:'macos-preview-keychain-secret',
  libraryDirectory,
  profile:'balanced'
}))
NODE
curl --fail --silent   -X POST   -H "content-type: application/json"   -H "x-pica-csrf: $TOKEN"   -H "Origin: $URL"   --data-binary @"$WORK/keychain-settings.json"   "$URL/api/v1/desktop/settings" > "$WORK/keychain-settings-response.json"

wait_for_engine_restart "$TOKEN"
curl --fail --silent "$URL/api/v1/desktop/status" > "$WORK/status-keychain-configured.json"
json_assert "$WORK/status-keychain-configured.json" configured

KEYCHAIN_VALUE="$(
  security find-generic-password     -a "$KEYCHAIN_ACCOUNT"     -s "$KEYCHAIN_SERVICE"     -w "$KEYCHAIN"
)"
"$PACKAGE_ROOT/runtime/bin/node" - "$KEYCHAIN_VALUE" <<'NODE'
const value=JSON.parse(process.argv[2])
if(value.account!=='macos-preview-keychain-account')
  throw new Error('Keychain account mismatch')
if(value.password!=='macos-preview-keychain-secret')
  throw new Error('Keychain password mismatch')
NODE
if grep -R -a -F 'macos-preview-keychain-secret' "$DATA_HOME" >/dev/null 2>&1; then
  fail "macOS Keychain credential was written into the application data root"
fi

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"scope":"favorites","text":"macOS Preview Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query.json"
json_assert "$WORK/query.json" query

curl --fail --silent "$URL/api/v1/comics/macos-preview-1" > "$WORK/detail.json"
json_assert "$WORK/detail.json" detail

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"name":"macOS Preview Acceptance"}'   "$URL/api/v1/shelves" > "$WORK/shelf-create.json"
json_assert "$WORK/shelf-create.json" shelfCreate
SHELF_ID="$(
  "$PACKAGE_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.id||''))"     "$WORK/shelf-create.json"
)"
[[ -n "$SHELF_ID" ]] || fail "shelf id missing"

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"comicIds":["macos-preview-1"]}'   "$URL/api/v1/shelves/$SHELF_ID/items" > "$WORK/shelf-add.json"
json_assert "$WORK/shelf-add.json" shelfAdd
curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-contents.json"
json_assert "$WORK/shelf-contents.json" shelfContents

curl --fail --silent "$URL/api/v1/reader/comics/macos-preview-1/chapters" > "$WORK/reader-chapters.json"
json_assert "$WORK/reader-chapters.json" readerChapters
curl --fail --silent "$URL/api/v1/reader/comics/macos-preview-1/chapters/macos-preview-ep-1" > "$WORK/reader-chapter.json"
json_assert "$WORK/reader-chapter.json" readerChapter
curl --fail --silent "$URL/api/v1/reader/pictures/macos-preview-pic-1" > "$WORK/reader-page.png"
cmp -s "$PAGE_FILE" "$WORK/reader-page.png" || fail "reader page bytes changed in packaged runtime"

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"comicId":"macos-preview-1","episodeId":"macos-preview-ep-1","pageIndex":0}'   "$URL/api/v1/reader/progress" > "$WORK/reader-progress-saved.json"
json_assert "$WORK/reader-progress-saved.json" readerProgressSaved

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"comicIds":["macos-preview-1"],"source":"manual","run":false}'   "$URL/api/v1/download" > "$WORK/download-queued.json"
json_assert "$WORK/download-queued.json" downloadQueued
JOB_ID="$(
  "$PACKAGE_ROOT/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v[0]?.id||''))"     "$WORK/download-queued.json"
)"
[[ -n "$JOB_ID" ]] || fail "download job id missing"

curl --fail --silent -X POST -H "Origin: $URL"   "$URL/api/v1/downloads/$JOB_ID/pause" > "$WORK/download-paused.json"
json_assert "$WORK/download-paused.json" downloadPaused
curl --fail --silent -X POST -H "Origin: $URL"   "$URL/api/v1/downloads/$JOB_ID/resume" > "$WORK/download-resumed.json"
json_assert "$WORK/download-resumed.json" downloadResumed

stop_engine "$URL"
[[ -f "$DATA_HOME/data/library.db" ]] || fail "database was not persisted outside the package"

start_engine

curl --fail --silent "$URL/api/v1/desktop/status" > "$WORK/status-after-process-restart.json"
json_assert "$WORK/status-after-process-restart.json" configured
KEYCHAIN_RELOADED="$(
  security find-generic-password     -a "$KEYCHAIN_ACCOUNT"     -s "$KEYCHAIN_SERVICE"     -w "$KEYCHAIN"
)"
[[ "$KEYCHAIN_RELOADED" == "$KEYCHAIN_VALUE" ]] || fail "Keychain credential changed across process restart"

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "Origin: $URL"   --data '{"scope":"favorites","text":"macOS Preview Fixture","limit":20}'   "$URL/api/v1/library/query" > "$WORK/query-after-restart.json"
json_assert "$WORK/query-after-restart.json" query
curl --fail --silent "$URL/api/v1/shelves" > "$WORK/shelves-after-restart.json"
json_assert "$WORK/shelves-after-restart.json" shelvesPersisted
curl --fail --silent "$URL/api/v1/shelves/$SHELF_ID" > "$WORK/shelf-after-restart.json"
json_assert "$WORK/shelf-after-restart.json" shelfContents
curl --fail --silent "$URL/api/v1/downloads" > "$WORK/downloads-after-restart.json"
json_assert "$WORK/downloads-after-restart.json" downloadsPersisted
curl --fail --silent -X POST -H "Origin: $URL"   "$URL/api/v1/downloads/$JOB_ID/resume" > "$WORK/download-resumed-after-restart.json"
json_assert "$WORK/download-resumed-after-restart.json" downloadResumed
curl --fail --silent "$URL/api/v1/reader/progress" > "$WORK/reader-progress-after-restart.json"
json_assert "$WORK/reader-progress-after-restart.json" readerProgressPersisted
curl --fail --silent "$URL/api/v1/reader/comics/macos-preview-1/chapters/macos-preview-ep-1" > "$WORK/reader-chapter-after-restart.json"
json_assert "$WORK/reader-chapter-after-restart.json" readerChapterResumed
curl --fail --silent "$URL/api/v1/reader/pictures/macos-preview-pic-1" > "$WORK/reader-page-after-restart.png"
cmp -s "$PAGE_FILE" "$WORK/reader-page-after-restart.png" || fail "reader page was not readable after restart"

stop_engine "$URL"

if grep -R -a -F 'macos-preview-keychain-secret' "$DATA_HOME" >/dev/null 2>&1; then
  fail "macOS Keychain credential appeared in the application data root"
fi
if find "$PACKAGE_ROOT" -type f \(   -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite' \) -print | grep -q .; then
  fail "preview flow wrote user state into the application package"
fi

echo "macOS arm64 preview vertical acceptance: PASS"
