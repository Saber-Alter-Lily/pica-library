#!/usr/bin/env bash
# One real Android emulator pass for the independently installable, source-free QA APK.
set -euo pipefail
# Fail on malformed Python before the costly Android 35 emulator compilation.
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("scripts/s3-android-local-emulator-flow.py").read_text(encoding="utf-8")); print("PASS: Android emulator flow Python syntax")'
cd mobile/android-alpha2
gradle :local-app:assembleDebug :app:assembleDebug :user-host-app:assembleDebug --no-daemon --max-workers=2
# Install the SOURCE-FREE Reader first: it owns the signature-level
# Binder permission; the optional Host may never define the trust root.
apk=local-app/build/outputs/apk/debug/local-app-debug.apk
test -s "$apk"
adb install -r "$apk"
host_dir=user-host-app/build/outputs/apk/debug
host="$host_dir/user-host-app-debug.apk"
test -s "$host"
# Keep the first installed source APK intact, then build a distinct higher
# versionCode with the exact same Android debug signer and Binder ABI.
cp "$host" "$host_dir/user-host-app-v1-debug.apk"
gradle :user-host-app:assembleDebug -PqaHostVersionCode=2 --no-daemon --max-workers=2
test -s "$host"
cp "$host" "$host_dir/user-host-app-v2-debug.apk"
if cmp -s "$host_dir/user-host-app-v1-debug.apk" "$host_dir/user-host-app-v2-debug.apk"; then
    echo "Host QA v1/v2 APKs must be distinct artifacts" >&2
    exit 1
fi
adb install -r "$host_dir/user-host-app-v1-debug.apk"
original=app/build/outputs/apk/debug/app-debug.apk
test -s "$original"
adb install -r "$original"
cd ../..
python3 scripts/s3-android-local-emulator-flow.py
