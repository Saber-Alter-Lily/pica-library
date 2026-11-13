#!/usr/bin/env bash
# Official Gradle 8.9 distribution recovery for temporary external CDN 504.
# Only two Gradle-controlled endpoints and the ORIGINAL exact SHA-256 are
# accepted. No alternative release, unpinned mirror or test skip is allowed.
set -euo pipefail
: "${RUNNER_TEMP:?Expected GitHub Actions runner temporary directory}"
: "${GITHUB_PATH:?Expected GitHub Actions PATH file}"
archive="$RUNNER_TEMP/gradle-8.9-bin.zip"
checksum='d725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab'
verified=0
for endpoint in \
  'https://downloads.gradle.org/distributions/gradle-8.9-bin.zip' \
  'https://services.gradle.org/distributions/gradle-8.9-bin.zip'; do
  rm -f -- "$archive"
  if curl --fail --location --retry 2 --retry-delay 3 --connect-timeout 20 --max-time 180 \
      "$endpoint" --output "$archive"; then
    if printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check -; then
      verified=1
      break
    fi
  fi
done
if [ "$verified" -ne 1 ]; then
  rm -f -- "$archive"
  echo 'Verified official Gradle 8.9 binary unavailable; acceptance remains BLOCKED' >&2
  exit 1
fi
unzip -q "$archive" -d "$RUNNER_TEMP"
test -x "$RUNNER_TEMP/gradle-8.9/bin/gradle"
echo "$RUNNER_TEMP/gradle-8.9/bin" >> "$GITHUB_PATH"
"$RUNNER_TEMP/gradle-8.9/bin/gradle" --version
