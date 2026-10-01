#!/usr/bin/env bash
set -euo pipefail

old="${1:?old APK path is required}"
new="${2:?new APK path is required}"
package_name="${3:-com.picalibrary.android}"
old_version_code="${4:-54}"
new_version_code="${5:-55}"

adb install "$old"
before="$(adb shell dumpsys package "$package_name" | tr -d '\r')"
printf '%s\n' "$before" | grep -q "versionCode=$old_version_code"
first_before="$(printf '%s\n' "$before" | sed -n 's/^[[:space:]]*firstInstallTime=//p' | head -n1)"
data_before="$(printf '%s\n' "$before" | sed -n 's/^[[:space:]]*dataDir=//p' | head -n1)"
test -n "$first_before"
test -n "$data_before"

adb install -r "$new"
after="$(adb shell dumpsys package "$package_name" | tr -d '\r')"
printf '%s\n' "$after" | grep -q "versionCode=$new_version_code"
first_after="$(printf '%s\n' "$after" | sed -n 's/^[[:space:]]*firstInstallTime=//p' | head -n1)"
data_after="$(printf '%s\n' "$after" | sed -n 's/^[[:space:]]*dataDir=//p' | head -n1)"
test "$first_before" = "$first_after"
test "$data_before" = "$data_after"

adb shell monkey -p "$package_name" -c android.intent.category.LAUNCHER 1
sleep 2
test -n "$(adb shell pidof "$package_name" | tr -d '\r')"
printf '%s\n' 'ANDROID_V54_TO_V55_INPLACE_UPDATE=PASS'
