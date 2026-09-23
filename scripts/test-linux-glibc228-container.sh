#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"
BASELINE_IMAGE="${PICA_LIBRARY_GLIBC_BASELINE_IMAGE:-rockylinux:8.9}"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <linux-experimental.tar.gz>" >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the glibc 2.28 runtime gate" >&2
  exit 2
fi

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(
  find "$WORK" -mindepth 1 -maxdepth 1 -type d     -name 'Pica-Library-*-linux-x64-experimental' -print -quit
)"
if [[ -z "$PACKAGE_ROOT" ]]; then
  echo "Linux package root was not found" >&2
  exit 1
fi

DATA_HOME="$WORK/user-data"
mkdir -p "$DATA_HOME"

docker run --rm   --platform linux/amd64   --mount "type=bind,src=$PACKAGE_ROOT,dst=/opt/pica,readonly"   --mount "type=bind,src=$DATA_HOME,dst=/data"   -e PICA_LIBRARY_DESKTOP_HOME=/data   "$BASELINE_IMAGE"   /bin/bash -lc '
set -euo pipefail

fail() {
  echo "Linux glibc baseline runtime gate: $*" >&2
  if [[ -f /data/engine.log ]]; then
    cat /data/engine.log >&2 || true
  fi
  exit 1
}

GLIBC_LINE="$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
if [[ "$GLIBC_LINE" != "glibc 2.28" ]]; then
  fail "expected Rocky Linux 8.9 glibc 2.28, detected: $GLIBC_LINE"
fi

/opt/pica/runtime/linux-preflight.sh

PICA_LIBRARY_HOME=/data/data   /opt/pica/runtime/bin/node /opt/pica/app/pica-library.js   init --data-dir /data/data --json > /data/cli-init.json

/opt/pica/runtime/bin/node - /data/cli-init.json <<"NODE"
const fs = require("fs")
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
if (!value.database || !value.dataDir)
  throw new Error("packaged CLI did not initialize the baseline data root")
NODE

/opt/pica/pica-library --headless > /data/engine.log 2>&1 &
ENGINE_PID="$!"
cleanup_engine() {
  if kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
}
trap cleanup_engine EXIT

INSTANCE_FILE=/data/runtime-state/instance.json
URL=""
for _ in $(seq 1 120); do
  if [[ -f "$INSTANCE_FILE" ]]; then
    URL="$(
      /opt/pica/runtime/bin/node -e         "try{const v=JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\"));process.stdout.write(String(v.url||\"\"))}catch{}"         "$INSTANCE_FILE"
    )"
    if [[ -n "$URL" ]]; then
      if /opt/pica/runtime/bin/node - "$URL" <<"NODE" >/dev/null 2>&1
const url = process.argv[2]
fetch(url + "/api/v1/desktop/status")
  .then((response) => {
    if (!response.ok) throw new Error("status not ready")
  })
  .catch(() => process.exit(1))
NODE
      then
        break
      fi
    fi
  fi
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    fail "packaged engine exited during startup"
  fi
  sleep 0.25
done

if [[ -z "$URL" ]]; then
  fail "packaged engine did not publish a healthy loopback URL"
fi

/opt/pica/runtime/bin/node - "$URL" <<"NODE"
const url = process.argv[2]
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
;(async () => {
  const statusResponse = await fetch(url + "/api/v1/desktop/status")
  assert(statusResponse.ok, "desktop status failed")
  const status = await statusResponse.json()

  const capabilityResponse = await fetch(url + "/api/v1/capabilities")
  assert(capabilityResponse.ok, "capability discovery failed")
  const capabilities = await capabilityResponse.json()

  assert(status.runtime?.mode === "headless", "headless runtime mode missing")
  assert(status.platform?.id === "linux", "Linux platform identity missing")
  assert(status.platform?.arch === "x64", "Linux x64 architecture identity missing")
  assert(status.platform?.distributionReady === false, "baseline runtime must remain preview-only")
  assert(status.platform?.selfUpdate === false, "baseline runtime must not self-update")
  assert(capabilities.runtime?.role === "server", "capability runtime role mismatch")
  assert(capabilities.runtime?.platform === "linux", "capability platform mismatch")
  assert(capabilities.runtime?.arch === "x64", "capability architecture mismatch")
  assert(capabilities.features?.updatePackages === false, "Linux updatePackages must remain false")
  assert(capabilities.capabilityStates?.selfUpdate?.available === false, "Linux self-update capability became available")

  const token = String(status.csrfToken || "")
  assert(token.length > 0, "Desktop CSRF token missing")
  const shutdown = await fetch(url + "/api/v1/desktop/shutdown", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pica-csrf": token,
      "origin": url
    },
    body: "{}"
  })
  assert(shutdown.ok, "graceful shutdown request failed")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
NODE

for _ in $(seq 1 80); do
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    ENGINE_PID=""
    break
  fi
  sleep 0.25
done
if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
  fail "packaged engine did not stop cleanly on glibc 2.28"
fi
trap - EXIT

if [[ ! -f /data/data/library.db ]]; then
  fail "baseline run did not persist the external SQLite database"
fi

echo "Linux glibc 2.28 packaged runtime gate: PASS"
'

echo "Linux glibc 2.28 container acceptance: PASS"
