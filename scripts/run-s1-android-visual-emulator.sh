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
    # Stage-3: exercise the real download page's tasks and storage spotlight without tapping either.
    task_log="s1-visual-evidence/${folder}-downloads-instrumentation.txt"
    task_trace="s1-visual-evidence/${folder}-downloads-logcat.txt"
    adb logcat -c || true
    set +e
    timeout --signal=TERM --kill-after=10s 150s adb shell am instrument -w -r \
        -e expectedFontScale "$scale" \
        -e class com.picalibrary.android.S1AndroidVisualSmokeTest#captureRealDownloadsSpotlightWithoutStartingTasks \
        com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner > "$task_log" 2>&1
    task_exit=$?
    set -e
    adb logcat -d -s S1_VISUAL:I AndroidRuntime:E > "$task_trace" || true
    cat "$task_log"
    grep "S1_VISUAL" "$task_trace" || true
    if [[ "$task_exit" -ne 0 ]] || ! grep -Fq 'OK (1 test)' "$task_log"; then
        echo "::error::S1 downloads spotlight failed/timeout ($folder exit=$task_exit)" >&2
        exit 1
    fi
    for phase in 1 2; do
        proof="zhCN-light-downloads-spotlight-$phase.png"
        adb exec-out run-as com.picalibrary.android.dev cat "files/s1-visual-$folder/$proof" \
            > "s1-visual-evidence/$folder/$proof"
        test -s "s1-visual-evidence/$folder/$proof"
    done
    # Stages 4/5: real passive pairing/update VSpot, without scanning, pairing or checking updates.
    for spec in "pairingTwoLiveControlsWithoutPairing:pairing" "updateTwoLiveControlsWithoutCheckingUpdates:update" \
        "preferenceTwoLiveControlsWithoutSaving:preferences" "webdavTwoLiveControlsWithoutConnecting:webdav" \
        "profileTwoLiveControlsWithoutRebuilding:profile"; do
        method=$(printf '%s' "$spec" | cut -d: -f1)
        page=$(printf '%s' "$spec" | cut -d: -f2)
        log="s1-visual-evidence/$folder-$page-instrumentation.txt"
        trace="s1-visual-evidence/$folder-$page-logcat.txt"
        adb logcat -c || true
        set +e
        timeout --signal=TERM --kill-after=10s 150s adb shell am instrument -w -r \
            -e expectedFontScale "$scale" \
            -e class "com.picalibrary.android.S1AdditionalSpotlightTest#$method" \
            com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner > "$log" 2>&1
        page_exit=$?
        set -e
        adb logcat -d -s S1_VISUAL:I AndroidRuntime:E > "$trace" || true
        cat "$log"
        grep "S1_VISUAL" "$trace" || true
        if [[ "$page_exit" -ne 0 ]] || ! grep -Fq 'OK (1 test)' "$log"; then
            echo "::error::S1 $page spotlight failed/timeout ($folder exit=$page_exit)" >&2
            exit 1
        fi
        for phase in 1 2; do
            proof="zhCN-light-$page-spotlight-$phase.png"
            adb exec-out run-as com.picalibrary.android.dev cat "files/s1-visual-$folder/$proof" \
                > "s1-visual-evidence/$folder/$proof"
            test -s "s1-visual-evidence/$folder/$proof"
        done
    done
    # Chapter 2: actual five-step Visual guide, without executing or changing any model.
    visual_log="s1-visual-evidence/$folder-visual-instrumentation.txt"
    visual_trace="s1-visual-evidence/$folder-visual-logcat.txt"
    adb logcat -c || true
    set +e
    timeout --signal=TERM --kill-after=10s 150s adb shell am instrument -w -r \
        -e expectedFontScale "$scale" \
        -e class com.picalibrary.android.S1AdditionalSpotlightTest#fiveVisualStepsHaveVisibleLiveTargetsWithoutStartingRecommendation \
        com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner > "$visual_log" 2>&1
    visual_exit=$?
    set -e
    adb logcat -d -s S1_VISUAL:I AndroidRuntime:E > "$visual_trace" || true
    cat "$visual_log"
    grep "S1_VISUAL" "$visual_trace" || true
    if [[ "$visual_exit" -ne 0 ]] || ! grep -Fq 'OK (1 test)' "$visual_log"; then
        echo "::error::S1 five-step Visual spotlight failed/timeout ($folder exit=$visual_exit)" >&2
        exit 1
    fi
    for step in 1 2 3 4 5; do
        proof="zhCN-light-visual-spotlight-$step.png"
        adb exec-out run-as com.picalibrary.android.dev cat "files/s1-visual-$folder/$proof" \
            > "s1-visual-evidence/$folder/$proof"
        test -s "s1-visual-evidence/$folder/$proof"
    done
    printf 'stage=all-eight-guide-chapters font_scale=%s captured=20 source_sha=%s\n' \
        "$scale" "$GITHUB_SHA" > "s1-visual-evidence/$folder/README.txt"
done
