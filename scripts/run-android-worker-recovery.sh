#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/mobile/android-alpha2"
RESULT_DIR="$ROOT_DIR/test-results/android-worker-recovery"
TARGET_PACKAGE="com.picalibrary.android.dev"
TEST_PACKAGE="com.picalibrary.android.dev.test"
RUNNER="androidx.test.runner.AndroidJUnitRunner"
TEST_CLASS="com.picalibrary.android.WorkerRecoveryProcessTest"
COMPONENT="$TEST_PACKAGE/$RUNNER"

mkdir -p "$RESULT_DIR"

cd "$ANDROID_DIR"
gradle :app:assembleDebug :app:assembleDebugAndroidTest --stacktrace

APP_APK="app/build/outputs/apk/debug/app-debug.apk"
TEST_APK="app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"

test -f "$APP_APK"
test -f "$TEST_APK"

adb install -r "$APP_APK"
adb install -r "$TEST_APK"
adb shell pm clear "$TARGET_PACKAGE" >/dev/null

run_case() {
    local method="$1"
    local output="$RESULT_DIR/${method}.txt"
    adb shell am instrument -w -r \
        -e class "$TEST_CLASS#$method" \
        "$COMPONENT" | tee "$output"
    grep -q "OK (1 test)" "$output"
    if grep -q "FAILURES!!!" "$output"; then
        echo "Instrumentation reported a failure for $method" >&2
        exit 1
    fi
}

run_case seedDurableRecoveryState

seed_pid="$(adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
printf '%s\n' "$seed_pid" > "$RESULT_DIR/seed-process.txt"

adb shell am force-stop "$TARGET_PACKAGE"
sleep 1

if adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | grep -q '[0-9]'; then
    echo "Target process survived adb force-stop" >&2
    exit 1
fi

run_case verifyDurableRecoveryStateAfterForceStop

verify_pid="$(adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
printf '%s\n' "$verify_pid" > "$RESULT_DIR/verify-process.txt"

cat > "$RESULT_DIR/result.json" <<JSON
{
  "task": "P2-G14",
  "targetPackage": "$TARGET_PACKAGE",
  "forceStopCommand": "adb shell am force-stop $TARGET_PACKAGE",
  "seedInstrumentation": "PASS",
  "verifyInstrumentation": "PASS",
  "seedProcessObservedAfterInvocation": "$seed_pid",
  "verifyProcessObservedAfterInvocation": "$verify_pid"
}
JSON

cat "$RESULT_DIR/result.json"
