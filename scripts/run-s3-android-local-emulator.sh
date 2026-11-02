#!/usr/bin/env bash
# One real Android emulator pass for the independently installable, source-free QA APK.
set -euo pipefail
cd mobile/android-alpha2
gradle :local-app:assembleDebug :app:assembleDebug :user-host-app:assembleDebug --no-daemon --max-workers=2
apk=local-app/build/outputs/apk/debug/local-app-debug.apk
test -s "$apk"
adb install -r "$apk"
original=app/build/outputs/apk/debug/app-debug.apk
test -s "$original"
adb install -r "$original"
host=user-host-app/build/outputs/apk/debug/user-host-app-debug.apk
test -s "$host"
adb install -r "$host"
cd ../..
python3 scripts/s3-android-local-emulator-flow.py
