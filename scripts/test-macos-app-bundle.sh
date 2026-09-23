#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <macos-experimental.tar.gz>" >&2
  exit 2
fi
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "macOS app-bundle acceptance requires an Apple Silicon macOS runner" >&2
  exit 1
fi

WORK="$(mktemp -d)"
OPEN_PID=""
DATA_HOME="$WORK/user-data"
LOG="$WORK/app-launch.log"

cleanup() {
  if [[ -n "$OPEN_PID" ]] && kill -0 "$OPEN_PID" 2>/dev/null; then
    kill "$OPEN_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "macOS app-bundle acceptance: $*" >&2
  [[ -f "$LOG" ]] && cat "$LOG" >&2 || true
  exit 1
}

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(
  find "$WORK" -mindepth 1 -maxdepth 1 -type d     -name 'Pica-Library-*-macos-arm64-experimental' -print | head -n 1
)"
[[ -n "$PACKAGE_ROOT" ]] || fail "package root not found"

SOURCE_APP="$PACKAGE_ROOT/Pica Library.app"
[[ -d "$SOURCE_APP" ]] || fail "Pica Library.app is missing"

PLIST="$SOURCE_APP/Contents/Info.plist"
EXECUTABLE="$SOURCE_APP/Contents/MacOS/Pica Library"
RESOURCES="$SOURCE_APP/Contents/Resources"
for required in   "$PLIST"   "$EXECUTABLE"   "$RESOURCES/PicaLibrary.icns"   "$RESOURCES/runtime/bin/node"   "$RESOURCES/app/desktop.js"   "$RESOURCES/web/index.html"   "$RESOURCES/SOURCE_SHA.txt"
do
  [[ -s "$required" ]] || fail "application bundle is missing: $required"
done

plutil -lint "$PLIST" >/dev/null
BUNDLE_ID="$(plutil -extract CFBundleIdentifier raw -o - "$PLIST")"
BUNDLE_EXECUTABLE="$(plutil -extract CFBundleExecutable raw -o - "$PLIST")"
BUNDLE_PACKAGE_TYPE="$(plutil -extract CFBundlePackageType raw -o - "$PLIST")"
MINIMUM_MACOS="$(plutil -extract LSMinimumSystemVersion raw -o - "$PLIST")"
[[ "$BUNDLE_ID" == "org.picalibrary.desktop" ]] || fail "unexpected bundle identifier: $BUNDLE_ID"
[[ "$BUNDLE_EXECUTABLE" == "Pica Library" ]] || fail "unexpected bundle executable: $BUNDLE_EXECUTABLE"
[[ "$BUNDLE_PACKAGE_TYPE" == "APPL" ]] || fail "bundle package type is not APPL"
[[ "$MINIMUM_MACOS" == "13.5" ]] || fail "bundle minimum macOS is not 13.5"

# The .app must remain functional when separated from the debug/CLI wrapper tree.
STANDALONE_ROOT="$WORK/standalone"
mkdir -p "$STANDALONE_ROOT" "$DATA_HOME"
STANDALONE_APP="$STANDALONE_ROOT/Pica Library.app"
ditto "$SOURCE_APP" "$STANDALONE_APP"
rm -rf "$PACKAGE_ROOT"

[[ -x "$STANDALONE_APP/Contents/MacOS/Pica Library" ]] || fail "standalone app executable is not executable"
[[ -s "$STANDALONE_APP/Contents/Resources/runtime/bin/node" ]] || fail "standalone app lost bundled Node runtime"
[[ -s "$STANDALONE_APP/Contents/Resources/app/desktop.js" ]] || fail "standalone app lost Desktop entrypoint"
[[ -s "$STANDALONE_APP/Contents/Resources/web/index.html" ]] || fail "standalone app lost Web UI"

# Launch through LaunchServices rather than invoking Contents/MacOS directly.
# --headless prevents a browser window from being required by CI.
PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME"   open -W -n "$STANDALONE_APP" --args --headless --no-open >"$LOG" 2>&1 &
OPEN_PID="$!"

INSTANCE_FILE="$DATA_HOME/runtime-state/instance.json"
URL=""
for _ in $(seq 1 160); do
  if [[ -f "$INSTANCE_FILE" ]]; then
    URL="$(
      "$STANDALONE_APP/Contents/Resources/runtime/bin/node" -e         "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.url||''))}catch{}"         "$INSTANCE_FILE"
    )"
    if [[ -n "$URL" ]] && curl --fail --silent "$URL/api/v1/desktop/status" >/dev/null 2>&1; then
      break
    fi
  fi
  if ! kill -0 "$OPEN_PID" 2>/dev/null; then
    fail "LaunchServices app process exited during startup"
  fi
  sleep 0.25
done
[[ -n "$URL" ]] || fail "standalone app did not publish a local service URL"

curl --fail --silent "$URL/api/v1/desktop/status" > "$WORK/status.json"
curl --fail --silent "$URL/api/v1/capabilities" > "$WORK/capabilities.json"

"$STANDALONE_APP/Contents/Resources/runtime/bin/node" -   "$WORK/status.json" "$WORK/capabilities.json" <<'NODE'
const fs=require('fs')
const [statusFile,capFile]=process.argv.slice(2)
const status=JSON.parse(fs.readFileSync(statusFile,'utf8'))
const caps=JSON.parse(fs.readFileSync(capFile,'utf8'))
const assert=(condition,message)=>{if(!condition)throw new Error(message)}
assert(status.application==='Pica Library','application identity mismatch')
assert(status.runtime?.mode==='headless','LaunchServices app did not enter headless mode')
assert(status.platform?.id==='macos','LaunchServices app platform mismatch')
assert(status.platform?.arch==='arm64','LaunchServices app architecture mismatch')
assert(status.platform?.distributionReady===false,'unsigned app must remain preview-only')
assert(status.platform?.selfUpdate===false,'unsigned app must not self-update')
assert(caps.runtime?.platform==='macos','capability platform mismatch')
assert(caps.runtime?.arch==='arm64','capability architecture mismatch')
assert(caps.features?.updatePackages===false,'macOS update package capability became enabled')
assert(typeof status.csrfToken==='string'&&status.csrfToken.length>0,'Desktop CSRF token missing')
NODE

TOKEN="$(
  "$STANDALONE_APP/Contents/Resources/runtime/bin/node" -e     "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.csrfToken||''))"     "$WORK/status.json"
)"
curl --fail --silent   -X POST   -H "content-type: application/json"   -H "x-pica-csrf: $TOKEN"   -H "Origin: $URL"   --data '{}'   "$URL/api/v1/desktop/shutdown" >/dev/null

for _ in $(seq 1 100); do
  if ! kill -0 "$OPEN_PID" 2>/dev/null; then
    OPEN_PID=""
    break
  fi
  sleep 0.25
done
if [[ -n "$OPEN_PID" ]] && kill -0 "$OPEN_PID" 2>/dev/null; then
  fail "LaunchServices did not observe app shutdown"
fi

[[ -f "$DATA_HOME/data/library.db" ]] || fail "standalone app did not use the external data root"
if find "$STANDALONE_APP" -type f ( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite' ) -print | grep -q .; then
  fail "standalone app wrote user database state inside the bundle"
fi

echo "macOS self-contained app-bundle acceptance: PASS"
