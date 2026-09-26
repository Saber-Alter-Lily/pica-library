#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/mobile/android-alpha2"
RESULT_DIR="$ROOT_DIR/test-results/android-real-load-macrobenchmark"
MODE="${1:-}"
shift || true
COMIC_ID=""
EPISODE_ID=""
SOURCE="pica"
TITLE="K3 Reader"
ALLOW_DIRTY=0

for arg in "$@"; do
  case "$arg" in
    --comic-id=*) COMIC_ID="${arg#--comic-id=}" ;;
    --episode-id=*) EPISODE_ID="${arg#--episode-id=}" ;;
    --source=*) SOURCE="${arg#--source=}" ;;
    --title=*) TITLE="${arg#--title=}" ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! "$MODE" =~ ^(prepare|download-loaded|reader-loaded)$ ]]; then
  echo "Usage: $0 prepare|download-loaded|reader-loaded [--comic-id=ID --episode-id=ID --source=pica --title=TITLE]" >&2
  exit 2
fi

adb get-state >/dev/null 2>&1 || { echo "A connected Android device is required." >&2; exit 1; }
model="$(adb shell getprop ro.product.model | tr -d '\r')"
qemu="$(adb shell getprop ro.kernel.qemu | tr -d '\r')"
if [[ "$qemu" == "1" ]] || [[ "$model" =~ [Ee]mulator|[Gg]eneric|[Ss][Dd][Kk].*[Gg]phone ]]; then
  echo "K3 refuses emulator/generic-device evidence: model=$model qemu=$qemu" >&2
  exit 1
fi

cd "$ROOT_DIR"
commit="$(git rev-parse HEAD | tr -d '\r')"
[[ "$commit" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "Unable to resolve git commit." >&2; exit 1; }
dirty=false
[[ -n "$(git status --porcelain)" ]] && dirty=true
if [[ "$dirty" == "true" && "$ALLOW_DIRTY" -ne 1 ]]; then
  echo "Working tree is dirty; commit/stash or pass --allow-dirty for diagnostic-only evidence." >&2
  exit 1
fi
cd "$ANDROID_DIR"

if [[ "$MODE" == "prepare" ]]; then
  gradle :app:installBenchmark --stacktrace
  adb shell monkey -p com.picalibrary.android -c android.intent.category.LAUNCHER 1 >/dev/null
  cat <<'TXT'
K3 preparation installed/opened the release-like benchmark app.

Required real-data preparation:
1. Configure a real Pica/E-H source if needed.
2. Choose a sufficiently large real comic and start a real download.
3. For Reader evidence, choose a real comic/chapter that can be opened in Reader.
4. Keep the download running while executing download-loaded or reader-loaded.
No comic/chapter IDs or credentials are exported by this preparation step.
TXT
  exit 0
fi

rm -rf "$RESULT_DIR"; mkdir -p "$RESULT_DIR"
serial="$(adb get-serialno | tr -d '\r')"
serial_hash="$(P2K_SERIAL="$serial" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.P2K_SERIAL||'').digest('hex'))")"
api="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"

gradle :app:assembleBenchmark :macrobenchmark:assembleBenchmark --stacktrace

if [[ "$MODE" == "download-loaded" ]]; then
  method="realDownloadOverlapTopLevelFrameTiming"
  args=(
    "-Pandroid.testInstrumentationRunnerArguments.picaK3DownloadLoaded=true"
  )
  scenario="real-download-loaded-navigation"
else
  [[ -n "$COMIC_ID" && -n "$EPISODE_ID" ]] || { echo "reader-loaded requires --comic-id and --episode-id" >&2; exit 2; }
  method="realReaderUnderDownloadFrameTiming"
  args=(
    "-Pandroid.testInstrumentationRunnerArguments.picaK3ReaderLoaded=true"
    "-Pandroid.testInstrumentationRunnerArguments.picaK3ComicId=$COMIC_ID"
    "-Pandroid.testInstrumentationRunnerArguments.picaK3EpisodeId=$EPISODE_ID"
    "-Pandroid.testInstrumentationRunnerArguments.picaK3Source=$SOURCE"
    "-Pandroid.testInstrumentationRunnerArguments.picaK3Title=$TITLE"
  )
  scenario="real-reader-under-download"
  adb shell dumpsys meminfo com.picalibrary.android > "$RESULT_DIR/meminfo-before.txt" || true
fi

set +e
gradle :macrobenchmark:connectedBenchmarkAndroidTest   "-Pandroid.testInstrumentationRunnerArguments.class=com.picalibrary.android.macrobenchmark.PicaRealLoadMacrobenchmark#$method"   "${args[@]}"   -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.enabledRules=Macrobenchmark   --stacktrace
code=$?
set -e

if [[ "$MODE" == "reader-loaded" ]]; then
  adb shell dumpsys meminfo com.picalibrary.android > "$RESULT_DIR/meminfo-after.txt" || true
fi

find macrobenchmark/build -type f \( -name '*benchmarkData.json' -o -name '*.perfetto-trace' \)   -mmin -90 -print0 2>/dev/null | while IFS= read -r -d '' file; do
    cp "$file" "$RESULT_DIR/$(basename "$file")"
  done

P2K_OUT="$RESULT_DIR/session.json" P2K_SCENARIO="$scenario" P2K_MODEL="$model" P2K_API="$api" P2K_ABI="$abi" P2K_SERIAL_HASH="$serial_hash" P2K_COMIC="$COMIC_ID" P2K_EPISODE="$EPISODE_ID" P2K_SOURCE="$SOURCE" P2K_EXIT="$code" P2K_COMMIT="$commit" P2K_DIRTY="$dirty" node <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'),e=process.env
const hash=v=>v?crypto.createHash('sha256').update(v).digest('hex'):null
fs.writeFileSync(e.P2K_OUT,JSON.stringify({
 schemaVersion:1,evidenceType:'p2-k-android-real-load-k3',collectedAt:new Date().toISOString(),
 scenario:e.P2K_SCENARIO,commit:e.P2K_COMMIT,dirty:e.P2K_DIRTY==='true',physicalDeviceRequired:true,emulatorAccepted:false,
 device:{serialSha256:e.P2K_SERIAL_HASH,model:e.P2K_MODEL,api:Number(e.P2K_API||0),abi:e.P2K_ABI},
 realInput:{comicIdSha256:hash(e.P2K_COMIC),episodeIdSha256:hash(e.P2K_EPISODE),source:e.P2K_SOURCE||null},
 rawIdsPersisted:false,syntheticMediaAccepted:false,exitCode:Number(e.P2K_EXIT),
 budgetSelected:false,concurrencyCapacitySelected:false
},null,2)+'\n')
NODE

[[ "$code" -eq 0 ]] || exit "$code"
find "$RESULT_DIR" -maxdepth 1 -name '*benchmarkData.json' | grep -q . || { echo "K3 completed without benchmarkData JSON." >&2; exit 1; }
echo "K3 $scenario evidence collected in $RESULT_DIR"
