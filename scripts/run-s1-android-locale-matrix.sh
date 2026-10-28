#!/usr/bin/env bash
# Nine pairwise Android-only UI variants; synthetic app state, no login, download, sync or update.
set -euo pipefail
cd mobile/android-alpha2
test -f settings.gradle || test -f settings.gradle.kts
gradle :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon --stacktrace
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell wm density 320
mkdir -p s1-locale-matrix-evidence
pages=(guide sources downloads recommendation webdav pairing tags)
# Read all scenarios before starting adb. adb shell/exec-out may consume
# its inherited stdin and otherwise terminate the here-doc while-loop early.
mapfile -t scenarios <<'S1_CASES'
zh-CN|light|360|1.0|zhCN-light-w360-f100
zh-CN|dark|393|1.3|zhCN-dark-w393-f130
zh-CN|light|480|1.5|zhCN-light-w480-f150
en|dark|360|1.5|en-dark-w360-f150
en|light|393|1.0|en-light-w393-f100
en|dark|480|1.3|en-dark-w480-f130
ja|light|360|1.3|ja-light-w360-f130
ja|dark|393|1.5|ja-dark-w393-f150
ja|light|480|1.0|ja-light-w480-f100
S1_CASES
count=0
for scenario in "${scenarios[@]}"; do
    IFS='|' read -r language theme width scale key <<< "$scenario"
    test -n "$key" || continue
    count=$((count + 1))
    adb shell wm size "$((width * 2))x1280"
    adb shell settings put system font_scale "$scale"
    adb shell am force-stop com.picalibrary.android.dev || true
    mkdir -p "s1-locale-matrix-evidence/$key"
    logfile="s1-locale-matrix-evidence/$key-instrumentation.txt"
    trace="s1-locale-matrix-evidence/$key-logcat.txt"
    adb logcat -c || true
    set +e
    timeout --signal=TERM --kill-after=10s 180s adb shell am instrument -w -r \
        -e language "$language" -e theme "$theme" -e widthDp "$width" \
        -e caseId "$key" -e expectedFontScale "$scale" \
        -e class com.picalibrary.android.S1AndroidLocaleMatrixTest#sixRealPagesRenderAtRequestedLocaleThemeFontAndWidth \
        com.picalibrary.android.dev.test/androidx.test.runner.AndroidJUnitRunner > "$logfile" 2>&1
    result=$?
    set -e
    adb logcat -d -s S1_MATRIX:I AndroidRuntime:E > "$trace" || true
    cat "$logfile"
    grep 'S1_MATRIX' "$trace" || true
    if [[ "$result" -ne 0 ]] || ! grep -Fq 'OK (1 test)' "$logfile"; then
        echo "::error::S1 locale matrix failed or timed out for $key (exit=$result)" >&2
        exit 1
    fi
    for page in "${pages[@]}"; do
        # Extract only the six allowlisted pages from the isolated debug package.
        adb exec-out run-as com.picalibrary.android.dev cat "files/s1-layout-$key/$page.png" \
            > "s1-locale-matrix-evidence/$key/$page.png"
        test -s "s1-locale-matrix-evidence/$key/$page.png"
    done
    printf 'source_sha=%s case=%s pages=7 locale=%s theme=%s width_dp=%s font=%s\n' \
        "$GITHUB_SHA" "$key" "$language" "$theme" "$width" "$scale" \
        > "s1-locale-matrix-evidence/$key/README.txt"
done
test "$count" -eq 9
adb shell wm size reset
adb shell wm density reset
