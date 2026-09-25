#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/mobile/android-alpha2"
RESULT_DIR="$ROOT_DIR/test-results/android-memory-background"
TARGET_PACKAGE="com.picalibrary.android.dev"

mkdir -p "$RESULT_DIR"

cleanup() {
    adb shell cmd deviceidle unforce >/dev/null 2>&1 || true
    adb shell dumpsys battery reset >/dev/null 2>&1 || true
}
trap cleanup EXIT

read_app_file_if_exists() {
    local path="$1"
    if adb shell run-as "$TARGET_PACKAGE" test -f "$path" >/dev/null 2>&1; then
        adb exec-out run-as "$TARGET_PACKAGE" cat "$path" 2>/dev/null || true
    fi
}

cd "$ANDROID_DIR"
gradle :app:assembleDebug --stacktrace

APP_APK="app/build/outputs/apk/debug/app-debug.apk"
test -f "$APP_APK"
adb install -r "$APP_APK"

# ---------------------------------------------------------------------------
# G16A: real-process trim-memory callback must evict both global Bitmap LRUs.
# ---------------------------------------------------------------------------
adb shell pm clear "$TARGET_PACKAGE" >/dev/null
adb shell am start -W     -n "$TARGET_PACKAGE/com.picalibrary.android.MemoryPressureProbeActivity"     --es action prime >"$RESULT_DIR/memory-prime.txt"

before=""
for _ in $(seq 1 40); do
    before="$(read_app_file_if_exists "files/p2-g16-memory-before")"
    [[ "$before" == pid=* ]] && break
    sleep 0.25
done
printf '%s\n' "$before" >"$RESULT_DIR/memory-before.txt"

before_pid="$(printf '%s' "$before" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')"
before_cover="$(printf '%s' "$before" | sed -n 's/.*cover=\([0-9][0-9]*\).*/\1/p')"
before_image="$(printf '%s' "$before" | sed -n 's/.*image=\([0-9][0-9]*\).*/\1/p')"
if [[ -z "$before_pid" || -z "$before_cover" || -z "$before_image" ]] ||
   (( before_cover <= 0 || before_image <= 0 )); then
    echo "Memory probe did not populate both Bitmap caches: $before" >&2
    exit 1
fi

# Move the probe UI definitively out of the foreground before sending a background trim.
# The PID must remain the same so a process restart cannot masquerade as successful eviction.
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.HOME \
    >"$RESULT_DIR/memory-home.txt"
sleep 1
background_pid="$(adb shell pidof "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
if [[ -z "$background_pid" || "$background_pid" != "$before_pid" ]]; then
    echo "Memory probe process changed before HIDDEN trim: before=$before_pid background=$background_pid" >&2
    exit 1
fi

# ActivityManager's shell API calls TRIM_MEMORY_UI_HIDDEN "HIDDEN".
adb shell am send-trim-memory "$TARGET_PACKAGE" HIDDEN

adb shell am start -W     -n "$TARGET_PACKAGE/com.picalibrary.android.MemoryPressureProbeActivity"     --es action report >"$RESULT_DIR/memory-report.txt"

after=""
for _ in $(seq 1 40); do
    after="$(read_app_file_if_exists "files/p2-g16-memory-after")"
    [[ "$after" == pid=* ]] && break
    sleep 0.25
done
printf '%s\n' "$after" >"$RESULT_DIR/memory-after.txt"

after_pid="$(printf '%s' "$after" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')"
after_cover="$(printf '%s' "$after" | sed -n 's/.*cover=\([0-9][0-9]*\).*/\1/p')"
after_image="$(printf '%s' "$after" | sed -n 's/.*image=\([0-9][0-9]*\).*/\1/p')"
if [[ "$before_pid" != "$after_pid" ]]; then
    echo "Trim-memory probe process changed unexpectedly: before=$before_pid after=$after_pid" >&2
    exit 1
fi
if [[ "$after_cover" != "0" || "$after_image" != "0" ]]; then
    echo "Bitmap caches survived HIDDEN trim: $after" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# G16B: a WorkManager job eligible during Doze must wait, then run after exit.
# ---------------------------------------------------------------------------
adb shell pm clear "$TARGET_PACKAGE" >/dev/null
adb shell am start -W     -n "$TARGET_PACKAGE/com.picalibrary.android.BackgroundRestrictionSeedActivity"     >"$RESULT_DIR/background-seed.txt"

ready=""
for _ in $(seq 1 80); do
    ready="$(read_app_file_if_exists "files/p2-g16-background-ready")"
    [[ "$ready" == "READY workId="* ]] && break
    if adb shell run-as "$TARGET_PACKAGE" test -s "files/p2-g16-background-failure" >/dev/null 2>&1; then
        failure="$(read_app_file_if_exists "files/p2-g16-background-failure")"
        printf '%s\n' "$failure" >&2
        exit 1
    fi
    sleep 0.25
done
printf '%s\n' "$ready" >"$RESULT_DIR/background-ready.txt"
if [[ "$ready" != "READY workId="* ]]; then
    echo "Timed out waiting for G16 background seed" >&2
    exit 1
fi

initial_count="$(read_app_file_if_exists "files/p2-g16-background-run-count" | tr -d '\r\n')"
if [[ -n "$initial_count" && "$initial_count" != "0" ]]; then
    echo "Background probe executed before Doze was applied: $initial_count" >&2
    exit 1
fi

adb shell dumpsys battery unplug >/dev/null
adb shell cmd deviceidle force-idle >"$RESULT_DIR/deviceidle-force.txt"
adb shell dumpsys deviceidle >"$RESULT_DIR/deviceidle-forced-state.txt"

# The WorkRequest has a 15 s initial delay. Stay in forced Doze beyond that boundary.
sleep 22

doze_count="$(read_app_file_if_exists "files/p2-g16-background-run-count" | tr -d '\r\n')"
if [[ -n "$doze_count" && "$doze_count" != "0" ]]; then
    echo "WorkManager probe executed while device was forced into Doze: $doze_count" >&2
    exit 1
fi

adb shell cmd deviceidle unforce >"$RESULT_DIR/deviceidle-unforce.txt"
adb shell dumpsys battery reset >/dev/null
adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true

recovered=0
run_count=0
for _ in $(seq 1 240); do
    raw="$(read_app_file_if_exists "files/p2-g16-background-run-count" | tr -d '\r\n')"
    if [[ "$raw" =~ ^[0-9]+$ ]]; then
        run_count="$raw"
        if (( run_count >= 1 )); then
            recovered=1
            break
        fi
    fi
    sleep 0.25
done

if [[ "$recovered" != "1" ]]; then
    adb logcat -d >"$RESULT_DIR/logcat-background-recovery.txt" || true
    echo "WorkManager probe did not resume after leaving Doze" >&2
    exit 1
fi

cat >"$RESULT_DIR/result.json" <<JSON
{
  "task": "P2-G16",
  "memoryTrim": {
    "signal": "HIDDEN",
    "sameProcess": true,
    "beforeCoverBytes": $before_cover,
    "beforeImageBytes": $before_image,
    "afterCoverBytes": $after_cover,
    "afterImageBytes": $after_image
  },
  "backgroundRestriction": {
    "mode": "forced-doze",
    "executedWhileIdle": false,
    "runCountAfterUnforce": $run_count
  }
}
JSON

cat "$RESULT_DIR/result.json"
