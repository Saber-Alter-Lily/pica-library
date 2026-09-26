#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-}"
shift || true
EVIDENCE_ROOT=""
ALLOW_DIRTY=0

for arg in "$@"; do
  case "$arg" in
    --root=*) EVIDENCE_ROOT="${arg#--root=}" ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! "$MODE" =~ ^(baseline|prepare-loaded|loaded|finalize)$ ]]; then
  echo "Usage: $0 baseline|prepare-loaded|loaded|finalize [--root=PATH] [--allow-dirty]" >&2
  exit 2
fi

cd "$ROOT_DIR"
for tool in adb git node bash; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done

if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  mapfile -t devices < <(adb devices | awk 'NR>1 && $2=="device"{print $1}')
  [[ "${#devices[@]}" -eq 1 ]] || { echo "K2 requires exactly one adb device unless ANDROID_SERIAL is set." >&2; exit 1; }
  export ANDROID_SERIAL="${devices[0]}"
fi

adb get-state >/dev/null
serial="$(adb get-serialno | tr -d '\r')"
model="$(adb shell getprop ro.product.model | tr -d '\r')"
qemu="$(adb shell getprop ro.kernel.qemu | tr -d '\r')"
if [[ "$qemu" == "1" ]] || [[ "$model" =~ [Ee]mulator|[Gg]eneric|[Ss][Dd][Kk].*[Gg]phone ]]; then
  echo "K2 refuses emulator/generic-device evidence: model=$model qemu=$qemu" >&2
  exit 1
fi

commit="$(git rev-parse HEAD | tr -d '\r')"
[[ "$commit" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "Unable to resolve git commit." >&2; exit 1; }
dirty=false
[[ -n "$(git status --porcelain)" ]] && dirty=true
if [[ "$dirty" == "true" && "$ALLOW_DIRTY" -ne 1 ]]; then
  echo "Working tree is dirty; commit/stash or pass --allow-dirty for diagnostic-only evidence." >&2
  exit 1
fi

serial_hash="$(P2K_SERIAL="$serial" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.P2K_SERIAL||'').digest('hex'))")"

if [[ "$MODE" == "baseline" ]]; then
  if [[ -z "$EVIDENCE_ROOT" ]]; then
    EVIDENCE_ROOT="test-results/p2k/android-physical/$(date -u +%Y%m%d-%H%M%S)"
  fi
  mkdir -p "$EVIDENCE_ROOT"
else
  [[ -n "$EVIDENCE_ROOT" ]] || { echo "--root is required for $MODE" >&2; exit 2; }
  [[ -d "$EVIDENCE_ROOT" ]] || { echo "Evidence root does not exist: $EVIDENCE_ROOT" >&2; exit 1; }
fi

EVIDENCE_ROOT="$(cd "$EVIDENCE_ROOT" && pwd)"
ENV_FILE="$EVIDENCE_ROOT/environment.json"
STATUS_FILE="$EVIDENCE_ROOT/run-status.json"

write_environment() {
  export P2K_ENV_FILE="$ENV_FILE" P2K_STATUS_FILE="$STATUS_FILE" P2K_COMMIT="$commit" P2K_DIRTY="$dirty"
  export P2K_SERIAL_HASH="$serial_hash" P2K_MODEL="$model"
  export P2K_MANUFACTURER="$(adb shell getprop ro.product.manufacturer | tr -d '\r')"
  export P2K_API="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
  export P2K_ABI="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
  export P2K_SOC_MODEL="$(adb shell getprop ro.soc.model | tr -d '\r')"
  export P2K_SOC_MANUFACTURER="$(adb shell getprop ro.soc.manufacturer | tr -d '\r')"
  export P2K_FINGERPRINT="$(adb shell getprop ro.build.fingerprint | tr -d '\r')"
  export P2K_REFRESH="$(adb shell dumpsys display 2>/dev/null | sed -n 's/.*fps=\([0-9.][0-9.]*\).*/\1/p' | head -n1 || true)"
  export P2K_MEMORY_KB="$(adb shell cat /proc/meminfo 2>/dev/null | sed -n 's/^MemTotal:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | tr -d '\r' | head -n1 || true)"
  node <<'NODE'
const fs=require('node:fs')
const e=process.env
fs.writeFileSync(e.P2K_ENV_FILE,JSON.stringify({
  schemaVersion:1,evidenceType:'p2-k-android-physical-reference',collectedAt:new Date().toISOString(),
  commit:e.P2K_COMMIT,dirty:e.P2K_DIRTY==='true',physicalDeviceRequired:true,emulatorAccepted:false,
  device:{serialSha256:e.P2K_SERIAL_HASH,manufacturer:e.P2K_MANUFACTURER,model:e.P2K_MODEL,
    api:Number(e.P2K_API||0),abi:e.P2K_ABI,socManufacturer:e.P2K_SOC_MANUFACTURER||null,
    socModel:e.P2K_SOC_MODEL||null,refreshRateObserved:e.P2K_REFRESH||null,
    memoryBytes:e.P2K_MEMORY_KB?Number(e.P2K_MEMORY_KB)*1024:null,buildFingerprint:e.P2K_FINGERPRINT},
  budgetSelected:false,concurrencyCapacitySelected:false
},null,2)+'\n')
fs.writeFileSync(e.P2K_STATUS_FILE,JSON.stringify({
  schemaVersion:1,evidenceType:'p2-k-android-physical-reference',commit:e.P2K_COMMIT,
  dirty:e.P2K_DIRTY==='true',runs:[]
},null,2)+'\n')
NODE
}

verify_session() {
  [[ -f "$ENV_FILE" && -f "$STATUS_FILE" ]] || { echo "Missing K2 session files." >&2; exit 1; }
  P2K_ENV_FILE="$ENV_FILE" P2K_COMMIT="$commit" P2K_SERIAL_HASH="$serial_hash" node <<'NODE'
const fs=require('node:fs')
const v=JSON.parse(fs.readFileSync(process.env.P2K_ENV_FILE,'utf8'))
if(v.commit!==process.env.P2K_COMMIT) throw new Error('K2 evidence session commit mismatch')
if(v?.device?.serialSha256!==process.env.P2K_SERIAL_HASH) throw new Error('K2 evidence session device mismatch')
if(v.physicalDeviceRequired!==true||v.emulatorAccepted!==false) throw new Error('K2 physical-device policy mismatch')
NODE
}

record_run() {
  local id="$1" output="$2" code="$3" started="$4" finished="$5"
  P2K_STATUS_FILE="$STATUS_FILE" P2K_RUN_ID="$id" P2K_OUTPUT="$output" P2K_EXIT_CODE="$code" P2K_STARTED="$started" P2K_FINISHED="$finished" node <<'NODE'
const fs=require('node:fs'),path=require('node:path'),e=process.env
const v=JSON.parse(fs.readFileSync(e.P2K_STATUS_FILE,'utf8')); v.runs=Array.isArray(v.runs)?v.runs:[]
v.runs=v.runs.filter(r=>r.id!==e.P2K_RUN_ID)
v.runs.push({id:e.P2K_RUN_ID,output:e.P2K_OUTPUT,
  outputExists:fs.existsSync(path.join(path.dirname(e.P2K_STATUS_FILE),e.P2K_OUTPUT)),
  exitCode:Number(e.P2K_EXIT_CODE),startedAt:e.P2K_STARTED,finishedAt:e.P2K_FINISHED})
fs.writeFileSync(e.P2K_STATUS_FILE,JSON.stringify(v,null,2)+'\n')
NODE
}

sanitize_device_json() {
  local file="$1"; [[ -f "$file" ]] || return 0
  P2K_FILE="$file" P2K_SERIAL_HASH="$serial_hash" node <<'NODE'
const fs=require('node:fs'),e=process.env
const v=JSON.parse(fs.readFileSync(e.P2K_FILE,'utf8')); delete v.serial; v.serialSha256=e.P2K_SERIAL_HASH
fs.writeFileSync(e.P2K_FILE,JSON.stringify(v,null,2)+'\n')
NODE
}

manifest() {
  node scripts/benchmark/build-p2k-evidence-manifest.mjs "--root=$EVIDENCE_ROOT" "--commit=$commit" "--evidence-type=p2-k-android-physical-reference"
}

if [[ "$MODE" == "baseline" ]]; then write_environment; else verify_session; fi

case "$MODE" in
  baseline)
    rm -rf test-results/android-macrobenchmark
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    set +e; bash scripts/run-android-macrobenchmark.sh; code=$?; set -e
    finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    target="$EVIDENCE_ROOT/g18-idle"; rm -rf "$target"
    [[ -d test-results/android-macrobenchmark ]] && cp -R test-results/android-macrobenchmark "$target"
    sanitize_device_json "$target/device.json"
    record_run G18_IDLE g18-idle "$code" "$started" "$finished"; manifest
    [[ "$code" -eq 0 ]] || exit "$code"
    echo "K2 baseline collected: $EVIDENCE_ROOT"
    echo "Next: $0 prepare-loaded --root=$EVIDENCE_ROOT"
    ;;
  prepare-loaded)
    bash scripts/run-android-loaded-macrobenchmark.sh prepare
    P2K_FILE="$EVIDENCE_ROOT/loaded-preparation.json" node <<'NODE'
const fs=require('node:fs')
fs.writeFileSync(process.env.P2K_FILE,JSON.stringify({
  schemaVersion:1,preparedAt:new Date().toISOString(),scenario:'G19 real Native Recommendation overlap',
  manualPrecondition:'Configure the benchmark app with a real Pica source or real synced portable candidate base; do not export credentials.'
},null,2)+'\n')
NODE
    manifest
    echo "Configure the real source/candidate base, then run: $0 loaded --root=$EVIDENCE_ROOT"
    ;;
  loaded)
    rm -rf test-results/android-loaded-macrobenchmark
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    set +e; bash scripts/run-android-loaded-macrobenchmark.sh run; code=$?; set -e
    finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    target="$EVIDENCE_ROOT/g19-recommendation-loaded"; rm -rf "$target"
    [[ -d test-results/android-loaded-macrobenchmark ]] && cp -R test-results/android-loaded-macrobenchmark "$target"
    sanitize_device_json "$target/device.json"
    record_run G19_RECOMMENDATION_LOADED g19-recommendation-loaded "$code" "$started" "$finished"; manifest
    [[ "$code" -eq 0 ]] || exit "$code"
    echo "K2 loaded evidence collected: $EVIDENCE_ROOT"
    ;;
  finalize)
    manifest
    P2K_STATUS_FILE="$STATUS_FILE" node <<'NODE'
const fs=require('node:fs'),e=process.env
const v=JSON.parse(fs.readFileSync(e.P2K_STATUS_FILE,'utf8')),m=new Map((v.runs||[]).map(r=>[r.id,r]))
for(const id of ['G18_IDLE','G19_RECOMMENDATION_LOADED']){
  const r=m.get(id); if(!r||Number(r.exitCode)!==0||r.outputExists!==true) throw new Error(`K2 finalize requires successful ${id}`)
}
NODE
    echo "K2 physical G18/G19 pair finalized: $EVIDENCE_ROOT"
    echo "Still external: real download-loaded/Reader-loaded scenarios and manual Android task-control acceptance."
    ;;
esac
