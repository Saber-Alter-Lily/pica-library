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
for scale in 1.0 1.5; do
    case "$scale" in
        1.0) folder=f100 ;;
        1.5) folder=f150 ;;
        *) echo "Unsupported font scale: $scale" >&2; exit 2 ;;
    esac
    adb shell settings put system font_scale "$scale"
    adb shell am force-stop com.picalibrary.android.dev || true
    # Only the dedicated scratch folder in the disposable .dev emulator package is cleared.
    adb shell rm -rf /sdcard/Android/data/com.picalibrary.android.dev/files/s1-visual
    log="s1-visual-evidence/${folder}-instrumentation.txt"
    adb shell am instrument -w -r -e expectedFontScale "$scale" \
        -e class com.picalibrary.android.S1AndroidVisualSmokeTest \
        com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner | tee "$log"
    grep -Fq 'OK (1 test)' "$log"
    mkdir -p "s1-visual-evidence/$folder"
    adb pull /sdcard/Android/data/com.picalibrary.android.dev/files/s1-visual \
        "s1-visual-evidence/$folder/"
    count=$(find "s1-visual-evidence/$folder/" -type f -name '*.png' | wc -l)
    if [[ "$count" -ne 12 ]]; then
        echo "Expected 12 fresh screenshot PNGs in $folder, found $count" >&2
        exit 1
    fi
    printf 'font_scale=%s captured=%s source_sha=%s\n' \
        "$scale" "$count" "$GITHUB_SHA" > "s1-visual-evidence/$folder/README.txt"
done
