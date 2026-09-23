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
cleanup() {
  if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -name 'Pica-Library-*-linux-x64-experimental' -print -quit)"
if [[ -z "$PACKAGE_ROOT" ]]; then
  echo "Linux package root was not found" >&2
  exit 1
fi

for required in   "$PACKAGE_ROOT/pica-library"   "$PACKAGE_ROOT/Pica Library.sh"   "$PACKAGE_ROOT/runtime/bin/node"   "$PACKAGE_ROOT/runtime/linux-preflight.sh"   "$PACKAGE_ROOT/app/desktop.js"   "$PACKAGE_ROOT/web/index.html"   "$PACKAGE_ROOT/SOURCE_SHA.txt"   "$PACKAGE_ROOT/PLATFORM_REQUIREMENTS.json"
do
  if [[ ! -s "$required" ]]; then
    echo "Linux package is missing: $required" >&2
    exit 1
  fi
done

PACKAGE_SOURCE="$(tr -d '\r\n' < "$PACKAGE_ROOT/SOURCE_SHA.txt")"
if [[ ! "$PACKAGE_SOURCE" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Linux package SOURCE_SHA is invalid" >&2
  exit 1
fi

"$PACKAGE_ROOT/runtime/bin/node" - "$PACKAGE_ROOT/PLATFORM_REQUIREMENTS.json" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const fail=(message)=>{throw new Error(message)}
if(value.schemaVersion!==1)fail('Linux platform requirements schema mismatch')
if(value.platform!=='linux'||value.arch!=='x64')fail('Linux platform requirements identity mismatch')
if(value.libc!=='glibc'||value.minimumGlibc!=='2.28')fail('Linux glibc baseline mismatch')
if(value.minimumKernel!=='4.18')fail('Linux kernel support baseline mismatch')
if(value.minimumGlibcxxSymbol!=='GLIBCXX_3.4.25')fail('Linux libstdc++ baseline mismatch')
if(value.formalRelease!==false)fail('Experimental Linux requirements claimed formal release')
if(!/^\d+\.\d+/.test(String(value.runtimeAbiObserved?.maxRequiredGlibc||'')))fail('Observed glibc ABI metadata missing')
NODE

DATA_HOME="$WORK/user-data"
mkdir -p "$DATA_HOME"
LOG="$WORK/linux-engine.log"
PICA_LIBRARY_DESKTOP_HOME="$DATA_HOME"   "$PACKAGE_ROOT/pica-library" --headless >"$LOG" 2>&1 &
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
    echo "Linux Desktop engine exited during startup" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 0.25
done

if [[ -z "$URL" ]]; then
  echo "Linux Desktop engine did not publish an instance URL" >&2
  cat "$LOG" >&2
  exit 1
fi

STATUS_FILE="$WORK/status.json"
CAP_FILE="$WORK/capabilities.json"
curl --fail --silent "$URL/api/v1/desktop/status" > "$STATUS_FILE"
curl --fail --silent "$URL/api/v1/capabilities" > "$CAP_FILE"

"$PACKAGE_ROOT/runtime/bin/node" - "$STATUS_FILE" "$CAP_FILE" "$PACKAGE_SOURCE" <<'NODE'
const fs=require('fs')
const [statusFile,capFile,source]=process.argv.slice(2)
const status=JSON.parse(fs.readFileSync(statusFile,'utf8'))
const caps=JSON.parse(fs.readFileSync(capFile,'utf8'))
const fail=(message)=>{throw new Error(message)}
if(status.application!=='Pica Library')fail('Unexpected application identity')
if(!status.runtime||status.runtime.mode!=='headless')fail('Headless runtime mode missing')
if(status.runtime.openBrowser!==false)fail('Headless mode must not open a browser')
if(status.runtime.idleBrowserShutdown!==false)fail('Headless mode must not idle-stop on browser close')
if(status.runtime.mobileBridge!==false)fail('Headless mode must default Mobile Bridge off')
if(status.mobileBridge!==null)fail('Headless mode unexpectedly started Mobile Bridge')
if(!status.platform||status.platform.id!=='linux')fail('Linux platform identity missing')
if(status.platform.runtimeFoundation!==true)fail('Linux runtime foundation not enabled')
if(status.platform.distributionReady!==false)fail('Experimental Linux must not be distributionReady')
if(status.platform.selfUpdate!==false)fail('Linux self update must stay disabled')
if(status.platform.browserLaunch!==true||status.platform.directoryLaunch!==true)fail('Linux launch capabilities missing')
if(!status.credentialBackend||typeof status.credentialBackend.kind!=='string')fail('Credential backend status missing')
if(typeof status.credentialBackend.securePersistence!=='boolean'||typeof status.credentialBackend.sessionOnly!=='boolean')fail('Credential backend truth is incomplete')
if(!status.nativePicker||typeof status.nativePicker.backend!=='string')fail('Native picker status missing')
if(!caps.features||caps.features.updatePackages!==false)fail('Linux updatePackages must be false')
if(Boolean(caps.capabilityStates?.secureCredentialPersistence?.available)!==Boolean(status.credentialBackend.securePersistence))fail('Credential capability disagrees with live backend status')
if(!/^[0-9a-f]{40}$/.test(source))fail('Invalid source provenance')
if(!status.csrfToken)fail('Desktop CSRF token missing')
process.stdout.write(status.csrfToken)
NODE
TOKEN="$("$PACKAGE_ROOT/runtime/bin/node" -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(v.csrfToken||'')" "$STATUS_FILE")"

if [[ -z "$TOKEN" ]]; then
  echo "Linux Desktop CSRF token missing" >&2
  exit 1
fi

curl --fail --silent   -X POST   -H "content-type: application/json"   -H "x-pica-csrf: $TOKEN"   -H "Origin: $URL"   --data '{}'   "$URL/api/v1/desktop/shutdown" >/dev/null

for _ in $(seq 1 60); do
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    ENGINE_PID=""
    break
  fi
  sleep 0.25
done
if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
  echo "Linux Desktop engine did not stop cleanly" >&2
  cat "$LOG" >&2
  exit 1
fi

if [[ ! -f "$DATA_HOME/data/library.db" ]]; then
  echo "Linux runtime did not place the database in the external user-data root" >&2
  exit 1
fi
if find "$PACKAGE_ROOT" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite' \) -print -quit | grep -q .; then
  echo "Linux runtime wrote user data into the application package" >&2
  exit 1
fi

echo "Linux experimental package smoke: PASS"
