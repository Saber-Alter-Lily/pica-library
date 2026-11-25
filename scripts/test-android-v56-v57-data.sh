#!/usr/bin/env bash
# Only run in the empty, rooted GitHub Actions emulator. Never target a user's device.
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
pkg=com.picalibrary.android
adb root
adb wait-for-device
test "$(adb shell id -u | tr -d '\r')" = 0
adb install "$RUNNER_TEMP/v56.apk"
start_app() {
  adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null
  for _ in {1..15}; do if adb shell pidof "$pkg" >/dev/null; then return 0; fi; sleep 1; done
  return 1
}
start_app
adb shell am force-stop "$pkg"
adb shell dumpsys package "$pkg" > "$RUNNER_TEMP/v56-state"
grep -Eq 'versionCode=56([[:space:]]|$)' "$RUNNER_TEMP/v56-state"
data=/data/user/0/$pkg
prefs="$data/shared_prefs/reader-bookmarks-v1.xml"
# Synthetic data belongs solely to this freshly installed v56 on the throwaway emulator.
adb shell "mkdir -p $data/shared_prefs"
printf '%s\n' '<?xml version="1.0" encoding="utf-8" standalone="yes"?><map><string name="recent:qa:synthetic-comic">chapter-7</string></map>' > "$RUNNER_TEMP/test-bookmark.xml"
adb push "$RUNNER_TEMP/test-bookmark.xml" "$prefs"
adb shell "chown \$(stat -c %u:%g $data) $prefs && chmod 600 $prefs && restorecon $prefs"
hash_prefs(){ adb shell "sha256sum $prefs" | tr -d '\r' | cut -d' ' -f1; }
before=$(hash_prefs)
test "$before" = "$(sha256sum "$RUNNER_TEMP/test-bookmark.xml" | cut -d' ' -f1)"
adb install -r candidate/Pica-Library-Android-v57.apk
adb shell dumpsys package "$pkg" > "$RUNNER_TEMP/v57-state"
grep -Eq 'versionCode=57([[:space:]]|$)' "$RUNNER_TEMP/v57-state"
for field in firstInstallTime dataDir; do
  first="$(sed -n "s/^[[:space:]]*$field=//p" "$RUNNER_TEMP/v56-state" | head -1)"
  next="$(sed -n "s/^[[:space:]]*$field=//p" "$RUNNER_TEMP/v57-state" | head -1)"
  test -n "$first" && test "$first" = "$next" || exit 1
done
start_app
sleep 2
adb shell pidof "$pkg"
test "$(hash_prefs)" = "$before"
echo 'ANDROID_V56_TO_V57_INPLACE_AND_BOOKMARK=PASS'
