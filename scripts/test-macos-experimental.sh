#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <macos-experimental.tar.gz>" >&2
  exit 2
fi
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "macOS experimental smoke requires an arm64 macOS runner" >&2
  exit 1
fi

WORK="$(mktemp -d)"
ENGINE_PID=""
cleanup() {
  if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -name 'Pica-Library-*-macos-arm64-experimental' -print | head -n 1)"
if [[ -z "$PACKAGE_ROOT" ]]; then
  echo "macOS package root was not found" >&2
  exit 1
fi

for required in   "$PACKAGE_ROOT/pica-library"   "$PACKAGE_ROOT/Pica Library.command"   "$PACKAGE_ROOT/runtime/bin/node"   "$PACKAGE_ROOT/app/desktop.js"   "$PACKAGE_ROOT/web/index.html"   "$PACKAGE_ROOT/SOURCE_SHA.txt"
do
  if [[ ! -s "$required" ]]; then
    echo "macOS package is missing: $required" >&2
    exit 1
  fi
done

DATA_HOME="$WORK/user-data"
mkdir -p "$DATA_HOME"
LOG="$WORK/macos-engine.log"
PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME"   "$PACKAGE_ROOT/pica-library" --no-open >"$LOG" 2>&1 &
ENGINE_PID="$!"

INSTANCE_FILE="$DATA_HOME/runtime-state/instance.json"
URL=""
for _ in $(seq 1 120); do
  if [[ -f "$INSTANCE_FILE" ]]; then
    URL="$(
      "$PACKAGE_ROOT/runtime/bin/node" -e         "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.url||''))}catch{}"         "$INSTANCE_FILE"
    )"
    if [[ -n "$URL" ]] && curl --fail --silent "$URL/api/v1/desktop/status" >/dev/null 2>&1; then
      break
    fi
  fi
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    echo "macOS Desktop engine exited during startup" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 0.25
done

if [[ -z "$URL" ]]; then
  echo "macOS Desktop engine did not publish an instance URL" >&2
  cat "$LOG" >&2
  exit 1
fi

STATUS_FILE="$WORK/status.json"
CAP_FILE="$WORK/capabilities.json"
curl --fail --silent "$URL/api/v1/desktop/status" > "$STATUS_FILE"
curl --fail --silent "$URL/api/v1/capabilities" > "$CAP_FILE"

"$PACKAGE_ROOT/runtime/bin/node" - "$STATUS_FILE" "$CAP_FILE" <<'NODE'
const fs=require('fs')
const [statusFile,capFile]=process.argv.slice(2)
const status=JSON.parse(fs.readFileSync(statusFile,'utf8'))
const caps=JSON.parse(fs.readFileSync(capFile,'utf8'))
const fail=(message)=>{throw new Error(message)}
if(status.application!=='Pica Library')fail('Unexpected application identity')
if(!status.platform||status.platform.id!=='macos')fail('macOS platform identity missing')
if(status.platform.arch!=='arm64')fail('macOS package did not run as arm64')
if(status.platform.runtimeFoundation!==true)fail('macOS runtime foundation not enabled')
if(status.platform.distributionReady!==false)fail('Experimental macOS must not be distributionReady')
if(status.platform.selfUpdate!==false)fail('macOS self update must stay disabled')
if(!status.credentialBackend||status.credentialBackend.kind!=='macos-keychain')fail('macOS Keychain backend missing')
if(status.credentialBackend.securePersistence!==true)fail('macOS Keychain persistence not reported')
if(!status.nativePicker||status.nativePicker.backend!=='macos-osascript')fail('macOS native picker backend missing')
if(status.nativePicker.folderPicker!==true||status.nativePicker.savePicker!==true)fail('macOS native picker capability missing')
if(!caps.features||caps.features.updatePackages!==false)fail('macOS updatePackages must be false')
const hasBrowser=Boolean(status.managedEhBrowser)
if(Boolean(status.platform.managedEhWebLogin)!==hasBrowser)fail('Managed E-H browser capability disagrees with discovery')
if(!status.csrfToken)fail('Desktop CSRF token missing')
NODE

TOKEN="$("$PACKAGE_ROOT/runtime/bin/node" -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(v.csrfToken||'')" "$STATUS_FILE")"
curl --fail --silent   -X POST   -H "content-type: application/json"   -H "x-pica-csrf: $TOKEN"   -H "Origin: $URL"   --data '{}'   "$URL/api/v1/desktop/shutdown" >/dev/null

for _ in $(seq 1 60); do
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    ENGINE_PID=""
    break
  fi
  sleep 0.25
done
if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
  echo "macOS Desktop engine did not stop cleanly" >&2
  cat "$LOG" >&2
  exit 1
fi

if [[ ! -f "$DATA_HOME/data/library.db" ]]; then
  echo "macOS runtime did not place the database in the external user-data root" >&2
  exit 1
fi
if find "$PACKAGE_ROOT" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite' \) -print | grep -q .; then
  echo "macOS runtime wrote user data into the application package" >&2
  exit 1
fi

echo "macOS arm64 experimental package smoke: PASS"
