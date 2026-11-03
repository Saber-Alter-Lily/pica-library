#!/usr/bin/env bash
# One real Android emulator pass for the independently installable, source-free QA APK.
set -euo pipefail
# Fail on malformed Python before the costly Android 35 emulator compilation.
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("scripts/s3-android-local-emulator-flow.py").read_text(encoding="utf-8")); print("PASS: Android emulator flow Python syntax")'
cd mobile/android-alpha2
# Reuse the same original full-product source set for the physically clean
# R8 build; its APK and :user-host-app use the SAME Gradle debug signer.
PICA_ANDROID_VERSION_CODE=55 gradle :local-app:assembleDebug :app:assembleDebug :app:assembleCleanSourceQa :user-host-app:assembleDebug -PsourceNeutralQa=true --no-daemon --max-workers=2
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
clean=app/build/outputs/apk/cleanSourceQa/app-cleanSourceQa.apk
test -s "$clean"
cp "$clean" "$qa_apks/clean-v55.apk"
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
cp "$original" "$qa_apks/legacy-dev-v55.apk"
# Build the newer QA from the SAME original clean app and debug signer.
# This is a disposable Android packageId, never the official 0.5.0 identity.
PICA_ANDROID_VERSION_CODE=56 gradle :app:assembleCleanSourceQa :app:assembleCleanCompatQa -PsourceNeutralQa=true --no-daemon --max-workers=2
test -s "$clean"
cp "$clean" "$qa_apks/clean-v56.apk"
compat=app/build/outputs/apk/cleanCompatQa/app-cleanCompatQa.apk
test -s "$compat"
cp "$compat" "$qa_apks/clean-compat-dev-v56.apk"
python3 ../../scripts/verify-android-clean-source-apk.py "$compat" "app/build/outputs/mapping/cleanCompatQa/mapping.txt"
aapt="$ANDROID_HOME/build-tools/35.0.0/aapt"
signer="$ANDROID_HOME/build-tools/35.0.0/apksigner"
"$aapt" dump badging "$qa_apks/clean-v55.apk" | grep -F "package: name='com.picalibrary.android.cleanqa' versionCode='55'"
"$aapt" dump badging "$qa_apks/clean-v56.apk" | grep -F "package: name='com.picalibrary.android.cleanqa' versionCode='56'"
"$aapt" dump badging "$qa_apks/legacy-dev-v55.apk" | grep -F "package: name='com.picalibrary.android.dev' versionCode='55'"
"$aapt" dump badging "$qa_apks/clean-compat-dev-v56.apk" | grep -F "package: name='com.picalibrary.android.dev' versionCode='56'"
cert55=$("$signer" verify --print-certs "$qa_apks/clean-v55.apk" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1)
cert56=$("$signer" verify --print-certs "$qa_apks/clean-v56.apk" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1)
test -n "$cert55" && test "$cert55" = "$cert56"
old_dev_cert=$("$signer" verify --print-certs "$qa_apks/legacy-dev-v55.apk" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1)
clean_dev_cert=$("$signer" verify --print-certs "$qa_apks/clean-compat-dev-v56.apk" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1)
test -n "$old_dev_cert" && test "$old_dev_cert" = "$clean_dev_cert"
test "$old_dev_cert" = "$cert55"
echo 'R4 clean→clean and legacy-provider→clean original-app upgrade candidate identities and signing certs match'
adb install -r "$qa_apks/clean-v55.apk"
cd ../..
python3 scripts/s3-android-local-emulator-flow.py
