#!/usr/bin/env bash
# One real Android emulator pass for the independently installable, source-free QA APK.
set -euo pipefail
# Fail on malformed Python before the costly Android 35 emulator compilation.
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("scripts/s3-android-local-emulator-flow.py").read_text(encoding="utf-8")); print("PASS: Android emulator flow Python syntax")'
cd mobile/android-alpha2
# Reuse the same original full-product source set for the physically clean
# R8 build; its APK and :user-host-app use the SAME Gradle debug signer.
gradle :local-app:assembleDebug :app:assembleDebug :app:assembleCleanSourceQa :user-host-app:assembleDebug -PsourceNeutralQa=true --no-daemon --max-workers=2
# Install the SOURCE-FREE Reader first: it owns the signature-level
# Binder permission; the optional Host may never define the trust root.
apk=local-app/build/outputs/apk/debug/local-app-debug.apk
test -s "$apk"
adb install -r "$apk"
host_dir=user-host-app/build/outputs/apk/debug
host="$host_dir/user-host-app-debug.apk"
test -s "$host"
# Android Gradle may replace the entire outputs/apk directory on the second
# build. Store BOTH QA versions outside Gradle-owned output directories.
qa_apks=s3-host-qa-apks
mkdir -p "$qa_apks"
cp "$host" "$qa_apks/user-host-v1.apk"
gradle :user-host-app:assembleDebug -PqaHostVersionCode=2 --no-daemon --max-workers=2
test -s "$host"
cp "$host" "$qa_apks/user-host-v2.apk"
if cmp -s "$qa_apks/user-host-v1.apk" "$qa_apks/user-host-v2.apk"; then
    echo "Host QA v1/v2 APKs must be distinct artifacts" >&2
    exit 1
fi
adb install -r "$qa_apks/user-host-v1.apk"
original=app/build/outputs/apk/debug/app-debug.apk
test -s "$original"
adb install -r "$original"
clean=app/build/outputs/apk/cleanSourceQa/app-cleanSourceQa.apk
test -s "$clean"
adb install -r "$clean"
cd ../..
python3 scripts/s3-android-local-emulator-flow.py
