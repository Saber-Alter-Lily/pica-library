#!/usr/bin/env bash
# Isolated Android emulator-only screenshot evidence; no accounts, production data, or source host.
set -euo pipefail

cd mobile/android-alpha2
# This cd MUST happen inside the same Bash process as gradle, not as a separate
# android-emulator-runner action command (the latter resets the working directory).
test -f settings.gradle || test -f settings.gradle.kts
gradle :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon --stacktrace

APK=app/build/outputs/apk/debug/app-debug.apk
TEST_APK=app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
test -s "$APK"
test -s "$TEST_APK"
adb install -r "$APK"
adb install -r -t "$TEST_APK"

adb shell wm size 720x1280
adb shell wm density 320
adb shell wm size
adb shell wm density
mkdir -p s1-visual-evidence
# Stage-1: ensure a genuine Activity can render, without pretending to pass all 24 cases.
for scale in 1.0 1.5; do
    case "$scale" in
        1.0) folder=f100 ;;
        1.5) folder=f150 ;;
        *) echo "Unsupported font scale: $scale" >&2; exit 2 ;;
    esac
    adb shell settings put system font_scale "$scale"
    adb shell am force-stop com.picalibrary.android.dev || true
    log="s1-visual-evidence/${folder}-instrumentation.txt"
    trace="s1-visual-evidence/${folder}-logcat.txt"
    adb logcat -c || true
    set +e
    timeout --signal=TERM --kill-after=10s 150s adb shell am instrument -w -r \
        -e expectedFontScale "$scale" \
        -e class com.picalibrary.android.S1AndroidVisualSmokeTest#captureFirstRealGuideScreenWithoutUserData \
        com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner > "$log" 2>&1
    exitcode=$?
    set -e
    adb logcat -d -s S1_VISUAL:I AndroidRuntime:E > "$trace" || true
    cat "$log"
    grep "S1_VISUAL" "$trace" || true
    if [[ "$exitcode" -ne 0 ]] || ! grep -Fq 'OK (1 test)' "$log"; then
        echo "::error::Android visual smoke failed/timeout: $folder ($exitcode); inspect instrumentation and logcat artifact." >&2
        exit 1
    fi
    mkdir -p "s1-visual-evidence/$folder"
    image="zhCN-light-advanced-guide.png"
    adb exec-out run-as com.picalibrary.android.dev cat "files/s1-visual-$folder/$image" \
        > "s1-visual-evidence/$folder/$image"
    test -s "s1-visual-evidence/$folder/$image"
    # Stage-2: actual 2-step VSpot overlay in AccountSourcesActivity, not text/manual UI.
    step_log="s1-visual-evidence/${folder}-spotlight-instrumentation.txt"
    step_trace="s1-visual-evidence/${folder}-spotlight-logcat.txt"
    adb logcat -c || true
    set +e
    timeout --signal=TERM --kill-after=10s 150s adb shell am instrument -w -r \
        -e expectedFontScale "$scale" \
        -e class com.picalibrary.android.S1AndroidVisualSmokeTest#captureRealSourceSpotlightWithoutRunningProviderActions \
        com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner > "$step_log" 2>&1
    step_exit=$?
    set -e
    adb logcat -d -s S1_VISUAL:I AndroidRuntime:E > "$step_trace" || true
    cat "$step_log"
    grep "S1_VISUAL" "$step_trace" || true
    if [[ "$step_exit" -ne 0 ]] || ! grep -Fq 'OK (1 test)' "$step_log"; then
        echo "::error::S1 source spotlight failed/timeout ($folder exit=$step_exit); see logs" >&2
        exit 1
    fi
    for phase in 1 2; do
        proof="zhCN-light-source-spotlight-$phase.png"
        adb exec-out run-as com.picalibrary.android.dev cat "files/s1-visual-$folder/$proof" \
            > "s1-visual-evidence/$folder/$proof"
        test -s "s1-visual-evidence/$folder/$proof"
    done
    printf 'stage=guide-plus-two-real-vspot-steps font_scale=%s captured=3 source_sha=%s\n' \
        "$scale" "$GITHUB_SHA" > "s1-visual-evidence/$folder/README.txt"
done
