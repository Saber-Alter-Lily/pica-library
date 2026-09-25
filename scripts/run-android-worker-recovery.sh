#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/mobile/android-alpha2"
RESULT_DIR="$ROOT/test-results/android-worker-recovery"
TARGET_PACKAGE="com.picalibrary.android.dev"
TEST_CLASS="com.picalibrary.android.WorkManagerProcessRecoveryInstrumentedTest"

mkdir -p "$RESULT_DIR"
rm -f "$RESULT_DIR"/*.txt

capture_logcat() {
  adb logcat -d > "$RESULT_DIR/logcat.txt" 2>/dev/null || true
}
trap 'status=$?; if [[ $status -ne 0 ]]; then capture_logcat; fi; exit $status' EXIT

cd "$ANDROID_DIR"
gradle :app:assembleDebug :app:assembleDebugAndroidTest --stacktrace --no-daemon

APP_APK="app/build/outputs/apk/debug/app-debug.apk"
TEST_APK="app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
[[ -f "$APP_APK" ]]
[[ -f "$TEST_APK" ]]

adb wait-for-device
adb shell input keyevent 82 >/dev/null 2>&1 || true
adb uninstall "$TARGET_PACKAGE" >/dev/null 2>&1 || true
adb uninstall "$TARGET_PACKAGE.test" >/dev/null 2>&1 || true
adb install -r "$APP_APK"
adb install -r "$TEST_APK"

RUNNER="$(
  adb shell pm list instrumentation |
    tr -d '\r' |
    awk -v target="target=$TARGET_PACKAGE" '
      index($0,target)>0 && index($0,"AndroidJUnitRunner")>0 {
        sub(/^instrumentation:/,"");
        sub(/ \(target=.*$/,"");
        print;
        exit;
      }
    '
)"
if [[ -z "$RUNNER" ]]; then
  echo "Could not discover AndroidJUnitRunner for $TARGET_PACKAGE" >&2
  adb shell pm list instrumentation >&2 || true
  exit 1
fi
printf '%s\n' "$RUNNER" > "$RESULT_DIR/runner.txt"

run_case() {
  local method="$1"
  local output="$RESULT_DIR/$method.txt"
  set +e
  adb shell am instrument -w -r \
    -e class "$TEST_CLASS#$method" \
    "$RUNNER" | tee "$output"
  local adb_status=${PIPESTATUS[0]}
  set -e

  if [[ $adb_status -ne 0 ]] ||
     grep -Eq 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=Process crashed' "$output" ||
     ! grep -q 'OK (' "$output"; then
    echo "Instrumentation case failed: $method" >&2
    return 1
  fi
}

run_case a_seedRecoveryState

adb shell am force-stop "$TARGET_PACKAGE"
sleep 1

STOP_LINE="$(
  adb shell dumpsys package "$TARGET_PACKAGE" |
    tr -d '\r' |
    grep -m1 'User 0:' || true
)"
printf '%s\n' "$STOP_LINE" > "$RESULT_DIR/force-stop-state.txt"
if [[ "$STOP_LINE" != *"stopped=true"* ]]; then
  echo "Package did not report stopped=true after am force-stop" >&2
  exit 1
fi

# A second instrumentation invocation is the explicit relaunch boundary.
# It starts a fresh target process without reinstalling or clearing app data.
run_case b_verifyRecoveryAfterForceStop

POST_LINE="$(
  adb shell dumpsys package "$TARGET_PACKAGE" |
    tr -d '\r' |
    grep -m1 'User 0:' || true
)"
printf '%s\n' "$POST_LINE" > "$RESULT_DIR/relaunch-state.txt"

echo "P2-G15 Android force-stop/relaunch recovery gate passed."
