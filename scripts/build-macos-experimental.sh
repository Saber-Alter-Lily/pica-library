#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="24.15.0"
MIN_MACOS="13.5"
PRODUCT_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$ROOT/package.json")"
GIT_SHA="$(git -C "$ROOT" rev-parse HEAD)"
SOURCE_SHA="${PICA_LIBRARY_BUILD_PROVENANCE:-$GIT_SHA}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "Experimental macOS package must be built on an arm64 macOS runner" >&2
  exit 1
fi
if [[ ! "$GIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve Git source commit SHA" >&2
  exit 1
fi
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Build provenance must be exactly 40 lowercase hex characters" >&2
  exit 1
fi

SHORT_SHA="${SOURCE_SHA:0:8}"
NAME="Pica-Library-v${PRODUCT_VERSION}-${SHORT_SHA}-macos-arm64-experimental"
BUILD_ROOT="$ROOT/artifacts/macos-package"
STAGE="$BUILD_ROOT/$NAME"
ARCHIVE="$ROOT/artifacts/$NAME.tar.gz"
CACHE_DIR="$ROOT/artifacts/cache"
RUNTIME_FILE="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
RUNTIME_CACHE="$CACHE_DIR/$RUNTIME_FILE"
RUNTIME_EXTRACT="$BUILD_ROOT/runtime-extract"
APP_BUNDLE="$STAGE/Pica Library.app"
CONTENTS="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ICONSET="$BUILD_ROOT/PicaLibrary.iconset"

rm -rf "$STAGE" "$RUNTIME_EXTRACT" "$ICONSET"
rm -f "$ARCHIVE"
mkdir -p "$MACOS_DIR" "$RESOURCES/app" "$RESOURCES/runtime/bin" "$RESOURCES/licenses" "$CACHE_DIR" "$ROOT/artifacts"

(
  cd "$ROOT"
  pnpm build
)

if [[ ! -f "$RUNTIME_CACHE" ]]; then
  curl --fail --location --silent --show-error     "https://nodejs.org/dist/v${NODE_VERSION}/$RUNTIME_FILE"     --output "$RUNTIME_CACHE"
fi

CHECKSUMS="$(curl --fail --location --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt")"
EXPECTED_HASH="$(printf '%s
' "$CHECKSUMS" | awk -v file="$RUNTIME_FILE" '$2 == file { print $1; exit }')"
if [[ ! "$EXPECTED_HASH" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Official Node.js runtime checksum was not found" >&2
  exit 1
fi
ACTUAL_HASH="$(shasum -a 256 "$RUNTIME_CACHE" | awk '{print $1}')"
if [[ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]]; then
  echo "Official Node.js runtime checksum mismatch" >&2
  exit 1
fi

mkdir -p "$RUNTIME_EXTRACT"
tar -xzf "$RUNTIME_CACHE" -C "$RUNTIME_EXTRACT"
RUNTIME_ROOT="$RUNTIME_EXTRACT/node-v${NODE_VERSION}-darwin-arm64"
cp "$RUNTIME_ROOT/bin/node" "$RESOURCES/runtime/bin/node"
chmod 0755 "$RESOURCES/runtime/bin/node"
cp "$RUNTIME_ROOT/LICENSE" "$RESOURCES/licenses/Node.js-LICENSE.txt"

NODE_MIN_MACOS="$(
  otool -l "$RESOURCES/runtime/bin/node" |
    awk '/LC_BUILD_VERSION/{found=1;next} found&&/minos/{print $2;exit}'
)"
if [[ ! "$NODE_MIN_MACOS" =~ ^[0-9]+(\.[0-9]+)+$ ]]; then
  echo "Could not determine bundled Node.js minimum macOS version" >&2
  exit 1
fi
if ! "$RESOURCES/runtime/bin/node" - "$NODE_MIN_MACOS" "$MIN_MACOS" <<'NODE'
const [observed, declared] = process.argv.slice(2).map((value) =>
  value.split('.').map(Number)
)
const width = Math.max(observed.length, declared.length)
for (let index = 0; index < width; index++) {
  const left = observed[index] || 0
  const right = declared[index] || 0
  if (left < right) process.exit(0)
  if (left > right) process.exit(1)
}
NODE
then
  echo "Bundled Node.js runtime requires macOS $NODE_MIN_MACOS, above the declared $MIN_MACOS baseline" >&2
  exit 1
fi

cp "$ROOT"/dist/*.js "$RESOURCES/app/"
cp "$ROOT/dist/licenses/THIRD_PARTY_LICENSES.txt" "$RESOURCES/licenses/THIRD_PARTY_LICENSES.txt"
cp -R "$ROOT/web" "$RESOURCES/web"

REGISTRY_SOURCE="$ROOT/src/data/registry-v3-final"
REGISTRY_TARGET="$RESOURCES/src/data/registry-v3-final"
REGISTRY_MIRROR="$RESOURCES/app/runtime-assets/registry-v3-final"
mkdir -p "$REGISTRY_TARGET" "$REGISTRY_MIRROR"
cp -R "$REGISTRY_SOURCE"/. "$REGISTRY_TARGET/"
cp -R "$REGISTRY_SOURCE"/. "$REGISTRY_MIRROR/"

REGISTRY_MANIFEST="$REGISTRY_TARGET/PICA_REGISTRY_V3_FINAL_MANIFEST.json"
if [[ ! -f "$REGISTRY_MANIFEST" ]]; then
  echo "Registry V3 runtime manifest is missing" >&2
  exit 1
fi
RUNTIME_SEMANTIC_FILE="$(
  "$RESOURCES/runtime/bin/node" -e     "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.runtime_semantic_file||''));"     "$REGISTRY_MANIFEST"
)"
for asset in   "PICA_REGISTRY_V3_FINAL_MANIFEST.json"   "$RUNTIME_SEMANTIC_FILE"   "PICA_ENTITY_REGISTRY_V3_FINAL.csv"   "PICA_TAG_ALIAS_MAP_V3_FINAL.json"   "PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv"   "PICA_TAG_LIBRARY_V2_REVIEWED.csv"   "PICA_TAG_ALIAS_MAP_V2.json"
do
  if [[ -z "$asset" || ! -f "$REGISTRY_TARGET/$asset" || ! -f "$REGISTRY_MIRROR/$asset" ]]; then
    echo "Required Registry V3 runtime asset is missing: $asset" >&2
    exit 1
  fi
done

cp "$ROOT/LICENSE" "$RESOURCES/LICENSE"
for notice in NOTICE.md UPSTREAM.md DISCLAIMER.md; do
  cp "$ROOT/$notice" "$RESOURCES/$notice"
done

cat > "$MACOS_DIR/Pica Library" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
CONTENTS="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RESOURCES="$CONTENTS/Resources"
exec "$RESOURCES/runtime/bin/node" "$RESOURCES/app/desktop.js" "$@"
EOF
chmod 0755 "$MACOS_DIR/Pica Library"

cat > "$CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Pica Library</string>
  <key>CFBundleExecutable</key>
  <string>Pica Library</string>
  <key>CFBundleIdentifier</key>
  <string>org.picalibrary.desktop</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Pica Library</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$PRODUCT_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$PRODUCT_VERSION</string>
  <key>CFBundleIconFile</key>
  <string>PicaLibrary.icns</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_MACOS</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF
plutil -lint "$CONTENTS/Info.plist" >/dev/null

ICON_SOURCE="$ROOT/web/pica-library-icon.webp"
if [[ ! -s "$ICON_SOURCE" ]]; then
  echo "macOS application icon source is missing" >&2
  exit 1
fi
mkdir -p "$ICONSET"
sips -s format png "$ICON_SOURCE" --out "$BUILD_ROOT/PicaLibrary-icon.png" >/dev/null
for spec in \
  "16 icon_16x16.png" \
  "32 icon_16x16@2x.png" \
  "32 icon_32x32.png" \
  "64 icon_32x32@2x.png" \
  "128 icon_128x128.png" \
  "256 icon_128x128@2x.png" \
  "256 icon_256x256.png" \
  "512 icon_256x256@2x.png" \
  "512 icon_512x512.png" \
  "1024 icon_512x512@2x.png"
do
  size="${spec%% *}"
  file="${spec#* }"
  sips -z "$size" "$size" "$BUILD_ROOT/PicaLibrary-icon.png" --out "$ICONSET/$file" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RESOURCES/PicaLibrary.icns"
[[ -s "$RESOURCES/PicaLibrary.icns" ]] || { echo "macOS .icns generation failed" >&2; exit 1; }

printf '%s\n' "$SOURCE_SHA" > "$RESOURCES/SOURCE_SHA.txt"

cat > "$RESOURCES/PLATFORM_REQUIREMENTS.json" <<EOF
{
  "schemaVersion": 1,
  "platform": "macos",
  "arch": "arm64",
  "minimumMacOS": "$MIN_MACOS",
  "observedNodeMinOS": "$NODE_MIN_MACOS",
  "nodeVersion": "$NODE_VERSION",
  "bundleIdentifier": "org.picalibrary.desktop",
  "applicationBundle": true,
  "formalRelease": false,
  "signed": false,
  "notarized": false
}
EOF

# Keep the existing CLI/debug surface without duplicating the canonical app payload.
for item in app runtime web src licenses LICENSE NOTICE.md UPSTREAM.md DISCLAIMER.md SOURCE_SHA.txt PLATFORM_REQUIREMENTS.json; do
  ln -s "Pica Library.app/Contents/Resources/$item" "$STAGE/$item"
done

cat > "$STAGE/pica-library" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$ROOT/Pica Library.app/Contents/MacOS/Pica Library" "$@"
EOF
chmod 0755 "$STAGE/pica-library"

cat > "$STAGE/Pica Library.command" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$ROOT/Pica Library.app/Contents/MacOS/Pica Library" "$@"
EOF
chmod 0755 "$STAGE/Pica Library.command"

cat > "$STAGE/README-MACOS.txt" <<EOF
Pica Library experimental macOS arm64 runtime
Product version: $PRODUCT_VERSION
Source: $SOURCE_SHA

Primary preview launcher:
- Pica Library.app

Compatibility/debug launchers:
- ./pica-library
- "Pica Library.command"

Runtime baseline:
- Apple Silicon (arm64)
- macOS >= $MIN_MACOS
- bundled official Node.js $NODE_VERSION darwin-arm64 runtime
- observed Node Mach-O minimum: macOS $NODE_MIN_MACOS

The .app bundle is self-contained and uses bundle identifier org.picalibrary.desktop.
This is still an unsigned, unnotarized experimental CI artifact.
Self-update remains disabled on macOS.
Saved credentials use macOS Keychain.
Folder/save dialogs use native macOS dialogs.

Formal macOS distribution still requires Developer ID signing, hardened-runtime
review, notarization, Gatekeeper acceptance, and release-channel policy.
EOF

for required in \
  "$CONTENTS/Info.plist" \
  "$MACOS_DIR/Pica Library" \
  "$RESOURCES/PicaLibrary.icns" \
  "$RESOURCES/runtime/bin/node" \
  "$RESOURCES/app/pica-library.js" \
  "$RESOURCES/app/desktop.js" \
  "$RESOURCES/licenses/Node.js-LICENSE.txt" \
  "$RESOURCES/licenses/THIRD_PARTY_LICENSES.txt" \
  "$RESOURCES/web/index.html" \
  "$RESOURCES/LICENSE" \
  "$RESOURCES/SOURCE_SHA.txt" \
  "$RESOURCES/PLATFORM_REQUIREMENTS.json" \
  "$STAGE/pica-library" \
  "$STAGE/Pica Library.command"
do
  if [[ ! -s "$required" ]]; then
    echo "Required macOS package file is missing or empty: $required" >&2
    exit 1
  fi
done

if find "$STAGE" -type f \(   -name '.env' -o   -name '.env.*' -o   -name '*.db' -o   -name '*.db-wal' -o   -name '*.db-shm' -o   -name '*.sqlite' \) -print | grep -q .; then
  echo "Forbidden user/developer data found in macOS package" >&2
  exit 1
fi
if find "$STAGE" -type d -name node_modules -print | grep -q .; then
  echo "node_modules must not be shipped in macOS package" >&2
  exit 1
fi

(
  cd "$BUILD_ROOT"
  tar -czf "$ARCHIVE" "$NAME"
)

HASH="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
SIZE="$(stat -f '%z' "$ARCHIVE")"
FILE_COUNT="$(find "$STAGE" -type f | wc -l | tr -d ' ')"
UNCOMPRESSED_KB="$(du -sk "$STAGE" | awk '{print $1}')"
UNCOMPRESSED="$((UNCOMPRESSED_KB * 1024))"

cat > "$ROOT/artifacts/MACOS-EXPERIMENTAL-SHA256SUMS.txt" <<EOF
$HASH  $(basename "$ARCHIVE")
EOF

"$RESOURCES/runtime/bin/node" -e   "console.log(JSON.stringify({path:process.argv[1],sha256:process.argv[2],size_bytes:Number(process.argv[3]),uncompressed_bytes:Number(process.argv[4]),file_count:Number(process.argv[5]),node_version:process.argv[6],product_version:process.argv[7],source_sha:process.argv[8],minimum_macos:process.argv[9],observed_node_minos:process.argv[10],bundle_identifier:'org.picalibrary.desktop',application_bundle:true,formal_release:false,signed:false,notarized:false},null,2))"   "$ARCHIVE" "$HASH" "$SIZE" "$UNCOMPRESSED" "$FILE_COUNT" "$NODE_VERSION" "$PRODUCT_VERSION" "$SOURCE_SHA" "$MIN_MACOS" "$NODE_MIN_MACOS"
