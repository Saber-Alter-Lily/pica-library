#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/mobile/android-alpha2"
RESULT_DIR="$ROOT_DIR/test-results/android-worker-force-stop-recovery"
TARGET_PACKAGE="com.picalibrary.android.dev"
TEST_PACKAGE="com.picalibrary.android.dev.test"
RUNNER="androidx.test.runner.AndroidJUnitRunner"
TEST_CLASS="com.picalibrary.android.WorkerForceStopRecoveryTest"
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
    adb shell am instrument -w \
        -e class "$TEST_CLASS#$method" \
        "$COMPONENT" | tee "$output"
    grep -q "OK (1 test)" "$output"
    if grep -q "FAILURES!!!" "$output"; then
        echo "Instrumentation reported a failure for $method" >&2
        exit 1
    fi
}

adb logcat -c
adb shell am start -W \
    -n "$TARGET_PACKAGE/com.picalibrary.android.WorkerForceStopSeedActivity" \
    >"$RESULT_DIR/seed-activity.txt"

ready=0
for _ in $(seq 1 120); do
    if adb exec-out run-as "$TARGET_PACKAGE" cat "files/p2-g15-ready" 2>/dev/null | grep -q '^READY pid='; then
        ready=1
        break
    fi
    if adb exec-out run-as "$TARGET_PACKAGE" cat "files/p2-g15-seed-failure" 2>/dev/null | grep -q '.'; then
        adb exec-out run-as "$TARGET_PACKAGE" cat "files/p2-g15-seed-failure" >&2 || true
        adb logcat -d >"$RESULT_DIR/logcat-seed-failure.txt" || true
        echo "Debug seed Activity reported failure" >&2
        exit 1
    fi
    sleep 0.25
done

if [[ "$ready" != "1" ]]; then
    adb logcat -d >"$RESULT_DIR/logcat-before-force-stop.txt" || true
    echo "Timed out waiting for P2-G15 READY marker from debug seed Activity" >&2
    exit 1
fi

seed_pid="$(adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
printf '%s\n' "$seed_pid" > "$RESULT_DIR/seed-process.txt"
if [[ -z "$seed_pid" ]]; then
    echo "Target process was not alive at force-stop boundary" >&2
    exit 1
fi

adb shell am force-stop "$TARGET_PACKAGE"
sleep 1

if adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | grep -q '[0-9]'; then
    echo "Target process survived adb force-stop" >&2
    exit 1
fi

# A force-stopped package is intentionally prevented from running background work.
# Re-enter the app through its normal launcher, then require WorkManager to reconstruct
# the unfinished RUNNING probe in the newly started process.
adb shell monkey -p "$TARGET_PACKAGE" -c android.intent.category.LAUNCHER 1 \
    >"$RESULT_DIR/relaunch.txt" 2>&1

probe_run_count=0
recovered=0
for _ in $(seq 1 240); do
    raw_count="$(adb exec-out run-as "$TARGET_PACKAGE" cat "files/p2-g15-probe-run-count" 2>/dev/null | tr -d '\r\n' || true)"
    if [[ "$raw_count" =~ ^[0-9]+$ ]]; then
        probe_run_count="$raw_count"
        if (( probe_run_count >= 2 )); then
            recovered=1
            break
        fi
    fi
    sleep 0.25
done

if [[ "$recovered" != "1" ]]; then
    adb logcat -d >"$RESULT_DIR/logcat-after-relaunch.txt" || true
    echo "WorkManager probe did not execute again after explicit app relaunch; runCount=$probe_run_count" >&2
    exit 1
fi

relaunch_pid="$(adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
printf '%s\n' "$relaunch_pid" > "$RESULT_DIR/relaunch-process.txt"
if [[ -z "$relaunch_pid" || "$relaunch_pid" == "$seed_pid" ]]; then
    echo "App relaunch did not produce a fresh target process" >&2
    exit 1
fi

run_case verifyDurableRecoveryStateAfterForceStop

verify_pid="$(adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
printf '%s\n' "$verify_pid" > "$RESULT_DIR/verify-process.txt"

cat > "$RESULT_DIR/result.json" <<JSON
{
  "task": "P2-G15",
  "targetPackage": "$TARGET_PACKAGE",
  "forceStopCommand": "adb shell am force-stop $TARGET_PACKAGE",
  "relaunchCommand": "adb shell monkey -p $TARGET_PACKAGE -c android.intent.category.LAUNCHER 1",
  "seedSurface": "DEBUG_ACTIVITY_FORCE_STOPPED_AS_DESIGNED",
  "probeRecoveredAfterRelaunch": true,
  "probeRunCount": $probe_run_count,
  "verifyInstrumentation": "PASS",
  "seedProcess": "$seed_pid",
  "relaunchProcess": "$relaunch_pid",
  "verifyProcess": "$verify_pid"
}
JSON

cat "$RESULT_DIR/result.json"
