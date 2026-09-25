#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/mobile/android-alpha2"
RESULT_DIR="$ROOT_DIR/test-results/android-loaded-macrobenchmark"
MODE="${1:-run}"

if ! adb get-state >/dev/null 2>&1; then
    echo "A connected Android device is required." >&2
    exit 1
fi

cd "$ANDROID_DIR"

if [[ "$MODE" == "prepare" ]]; then
    gradle :app:installBenchmark --stacktrace
    adb shell monkey -p com.picalibrary.android -c android.intent.category.LAUNCHER 1 >/dev/null
    cat <<'TXT'
G19 preparation installed and opened the release-like benchmark app.

Before running the loaded benchmark:
1. Configure a real Pica source OR sync a real portable candidate base.
2. Confirm "重新生成手机推荐" actually starts a non-trivial Android recommendation run.
3. Leave the benchmark app installed so its benchmark-signing-key data remains available.
4. Then run:
   bash scripts/run-android-loaded-macrobenchmark.sh run

No credentials are read or exported by this script.
TXT
    exit 0
fi

if [[ "$MODE" != "run" ]]; then
    echo "Usage: $0 [prepare|run]" >&2
    exit 2
fi

rm -rf "$RESULT_DIR"
mkdir -p "$RESULT_DIR"

serial="$(adb get-serialno | tr -d '\r')"
model="$(adb shell getprop ro.product.model | tr -d '\r')"
api="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
refresh_rate="$(adb shell dumpsys display 2>/dev/null | sed -n 's/.*fps=\([0-9.][0-9.]*\).*/\1/p' | head -n1 || true)"

cat >"$RESULT_DIR/device.json" <<JSON
{
  "serial": "$serial",
  "model": "$model",
  "api": "$api",
  "abi": "$abi",
  "refreshRateObserved": "$refresh_rate",
  "scenario": "real-native-recommendation-overlap",
  "resourceRequirement": ["provider-network", "cpu-analysis"],
  "warning": "No performance budget is selected by G19. Interpret only with representative physical-device context."
}
JSON

gradle :app:assembleBenchmark :macrobenchmark:assembleBenchmark --stacktrace

gradle :macrobenchmark:connectedBenchmarkAndroidTest \
    -Pandroid.testInstrumentationRunnerArguments.class=com.picalibrary.android.macrobenchmark.PicaLoadedMacrobenchmark#recommendationOverlapTopLevelFrameTiming \
    -Pandroid.testInstrumentationRunnerArguments.picaG19Loaded=true \
    -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.enabledRules=Macrobenchmark \
    --stacktrace

find macrobenchmark/build -type f \( -name '*benchmarkData.json' -o -name '*.perfetto-trace' \) \
    -mmin -90 -print0 2>/dev/null | while IFS= read -r -d '' file; do
        cp "$file" "$RESULT_DIR/$(basename "$file")"
    done

if ! find "$RESULT_DIR" -maxdepth 1 -type f -name '*benchmarkData.json' | grep -q .; then
    echo "Loaded Macrobenchmark completed without benchmarkData JSON." >&2
    exit 1
fi

cat "$RESULT_DIR/device.json"
