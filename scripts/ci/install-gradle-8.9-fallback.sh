#!/usr/bin/env bash
# Official Gradle CDN fallback after setup-gradle distribution provisioning 504.
# Never accept an unpinned ZIP or alter the Android/Gradle project versions.
set -euo pipefail
: "${RUNNER_TEMP:?Expected GitHub Actions runner temporary directory}"
: "${GITHUB_PATH:?Expected GitHub Actions PATH file}"
archive="$RUNNER_TEMP/gradle-8.9-bin.zip"
curl --fail --location --retry 3 --retry-delay 4 --max-time 240 \
  'https://downloads.gradle.org/distributions/gradle-8.9-bin.zip' \
  --output "$archive"
printf '%s  %s\n' \
  'd725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab' \
  "$archive" | sha256sum --check -
unzip -q "$archive" -d "$RUNNER_TEMP"
test -x "$RUNNER_TEMP/gradle-8.9/bin/gradle"
echo "$RUNNER_TEMP/gradle-8.9/bin" >> "$GITHUB_PATH"
"$RUNNER_TEMP/gradle-8.9/bin/gradle" --version
