#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/mobile/android-alpha2"
RESULT_DIR="$ROOT_DIR/test-results/android-macrobenchmark"

mkdir -p "$RESULT_DIR"

if ! adb get-state >/dev/null 2>&1; then
    echo "A connected Android device is required for Macrobenchmark." >&2
    exit 1
fi

serial="$(adb get-serialno | tr -d '\r')"
model="$(adb shell getprop ro.product.model | tr -d '\r')"
api="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"

cat >"$RESULT_DIR/device.json" <<JSON
{
  "serial": "$serial",
  "model": "$model",
  "api": "$api",
  "abi": "$abi",
  "warning": "Physical-device results are required for promotion budgets. Emulator output is harness-only."
}
JSON

cd "$ANDROID_DIR"

gradle :app:assembleBenchmark :macrobenchmark:assembleBenchmark --stacktrace

gradle :macrobenchmark:connectedBenchmarkAndroidTest     -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.enabledRules=Macrobenchmark     --stacktrace

find macrobenchmark/build -type f \( -name '*benchmarkData.json' -o -name '*.perfetto-trace' \)     -mmin -90 -print0 2>/dev/null | while IFS= read -r -d '' file; do
        cp "$file" "$RESULT_DIR/$(basename "$file")"
    done

if ! find "$RESULT_DIR" -maxdepth 1 -type f -name '*benchmarkData.json' | grep -q .; then
    echo "Macrobenchmark completed without a benchmarkData JSON artifact." >&2
    exit 1
fi

cat "$RESULT_DIR/device.json"
