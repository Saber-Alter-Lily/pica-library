#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="24.15.0"
MIN_GLIBC="2.28"
MIN_GLIBCXX="3.4.25"
SUPPORT_KERNEL="4.18"
PRODUCT_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$ROOT/package.json")"
GIT_SHA="$(git -C "$ROOT" rev-parse HEAD)"
SOURCE_SHA="${PICA_LIBRARY_BUILD_PROVENANCE:-$GIT_SHA}"

if [[ ! "$GIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve Git source commit SHA" >&2
  exit 1
fi
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Build provenance must be exactly 40 lowercase hex characters" >&2
  exit 1
fi

SHORT_SHA="${SOURCE_SHA:0:8}"
NAME="Pica-Library-v${PRODUCT_VERSION}-${SHORT_SHA}-linux-x64-experimental"
BUILD_ROOT="$ROOT/artifacts/linux-package"
STAGE="$BUILD_ROOT/$NAME"
ARCHIVE="$ROOT/artifacts/$NAME.tar.gz"
CACHE_DIR="$ROOT/artifacts/cache"
RUNTIME_FILE="node-v${NODE_VERSION}-linux-x64.tar.xz"
RUNTIME_CACHE="$CACHE_DIR/$RUNTIME_FILE"
RUNTIME_EXTRACT="$BUILD_ROOT/runtime-extract"

rm -rf "$STAGE" "$RUNTIME_EXTRACT"
rm -f "$ARCHIVE"
mkdir -p   "$STAGE/app"   "$STAGE/runtime/bin"   "$STAGE/licenses"   "$CACHE_DIR"   "$ROOT/artifacts"

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
ACTUAL_HASH="$(sha256sum "$RUNTIME_CACHE" | awk '{print $1}')"
if [[ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]]; then
  echo "Official Node.js runtime checksum mismatch" >&2
  exit 1
fi

mkdir -p "$RUNTIME_EXTRACT"
tar -xJf "$RUNTIME_CACHE" -C "$RUNTIME_EXTRACT"
RUNTIME_ROOT="$RUNTIME_EXTRACT/node-v${NODE_VERSION}-linux-x64"
cp "$RUNTIME_ROOT/bin/node" "$STAGE/runtime/bin/node"
chmod 0755 "$STAGE/runtime/bin/node"
cp "$RUNTIME_ROOT/LICENSE" "$STAGE/licenses/Node.js-LICENSE.txt"

if ! command -v readelf >/dev/null 2>&1; then
  echo "readelf is required to verify the Linux runtime ABI" >&2
  exit 1
fi
if ! readelf -h "$STAGE/runtime/bin/node" | grep -q 'Machine:.*Advanced Micro Devices X86-64'; then
  echo "Bundled Node.js runtime is not Linux x86-64" >&2
  exit 1
fi
RUNTIME_VERSION_INFO="$(readelf --version-info "$STAGE/runtime/bin/node")"
MAX_REQUIRED_GLIBC="$(
  printf '%s\n' "$RUNTIME_VERSION_INFO" |
    grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' |
    sed 's/^GLIBC_//' |
    sort -Vu |
    tail -n 1 || true
)"
MAX_REQUIRED_GLIBCXX="$(
  printf '%s\n' "$RUNTIME_VERSION_INFO" |
    grep -oE 'GLIBCXX_[0-9]+(\.[0-9]+)+' |
    sed 's/^GLIBCXX_//' |
    sort -Vu |
    tail -n 1 || true
)"
version_gt() {
  local left="$1"
  local right="$2"
  [[ "$left" != "$right" && "$(printf '%s\n%s\n' "$left" "$right" | sort -V | tail -n 1)" == "$left" ]]
}
if [[ -z "$MAX_REQUIRED_GLIBC" ]]; then
  echo "Could not determine the bundled Node.js glibc ABI requirement" >&2
  exit 1
fi
if version_gt "$MAX_REQUIRED_GLIBC" "$MIN_GLIBC"; then
  echo "Bundled Node.js runtime requires glibc $MAX_REQUIRED_GLIBC, above the declared $MIN_GLIBC baseline" >&2
  exit 1
fi
if [[ -n "$MAX_REQUIRED_GLIBCXX" ]] && version_gt "$MAX_REQUIRED_GLIBCXX" "$MIN_GLIBCXX"; then
  echo "Bundled Node.js runtime requires GLIBCXX_$MAX_REQUIRED_GLIBCXX, above the declared GLIBCXX_$MIN_GLIBCXX baseline" >&2
  exit 1
fi

cp "$ROOT/scripts/linux-runtime-preflight.sh" "$STAGE/runtime/linux-preflight.sh"
chmod 0755 "$STAGE/runtime/linux-preflight.sh"

cp "$ROOT"/dist/*.js "$STAGE/app/"
cp "$ROOT/dist/licenses/THIRD_PARTY_LICENSES.txt" "$STAGE/licenses/THIRD_PARTY_LICENSES.txt"
cp -R "$ROOT/web" "$STAGE/web"

REGISTRY_SOURCE="$ROOT/src/data/registry-v3-final"
REGISTRY_TARGET="$STAGE/src/data/registry-v3-final"
REGISTRY_MIRROR="$STAGE/app/runtime-assets/registry-v3-final"
mkdir -p "$REGISTRY_TARGET" "$REGISTRY_MIRROR"
cp -R "$REGISTRY_SOURCE"/. "$REGISTRY_TARGET/"
cp -R "$REGISTRY_SOURCE"/. "$REGISTRY_MIRROR/"

REGISTRY_MANIFEST="$REGISTRY_TARGET/PICA_REGISTRY_V3_FINAL_MANIFEST.json"
if [[ ! -f "$REGISTRY_MANIFEST" ]]; then
  echo "Registry V3 runtime manifest is missing" >&2
  exit 1
fi
RUNTIME_SEMANTIC_FILE="$(
  "$STAGE/runtime/bin/node" -e     "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.runtime_semantic_file||''));"     "$REGISTRY_MANIFEST"
)"
for asset in   "PICA_REGISTRY_V3_FINAL_MANIFEST.json"   "$RUNTIME_SEMANTIC_FILE"   "PICA_ENTITY_REGISTRY_V3_FINAL.csv"   "PICA_TAG_ALIAS_MAP_V3_FINAL.json"   "PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv"   "PICA_TAG_LIBRARY_V2_REVIEWED.csv"   "PICA_TAG_ALIAS_MAP_V2.json"
do
  if [[ -z "$asset" || ! -f "$REGISTRY_TARGET/$asset" || ! -f "$REGISTRY_MIRROR/$asset" ]]; then
    echo "Required Registry V3 runtime asset is missing: $asset" >&2
    exit 1
  fi
done

cp "$ROOT/LICENSE" "$STAGE/LICENSE"
for notice in NOTICE.md UPSTREAM.md DISCLAIMER.md; do
  cp "$ROOT/$notice" "$STAGE/$notice"
done

cp "$ROOT/scripts/install-linux-user.sh" "$STAGE/install-linux-user.sh"
cp "$ROOT/scripts/uninstall-linux-user.sh" "$STAGE/uninstall-linux-user.sh"
chmod 0755 "$STAGE/install-linux-user.sh" "$STAGE/uninstall-linux-user.sh"

cat > "$STAGE/pica-library" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"$ROOT/runtime/linux-preflight.sh"
exec "$ROOT/runtime/bin/node" "$ROOT/app/desktop.js" "$@"
EOF
chmod 0755 "$STAGE/pica-library"

cat > "$STAGE/Pica Library.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$ROOT/pica-library" "$@"
EOF
chmod 0755 "$STAGE/Pica Library.sh"

cat > "$STAGE/README-LINUX.txt" <<EOF
Pica Library experimental Linux x64 runtime
Product version: $PRODUCT_VERSION
Source: $SOURCE_SHA

1. Extract the entire archive.
2. For a user-level desktop-menu install, run ./install-linux-user.sh.
   The application is copied to ~/.local/opt/pica-library by default while
   databases/download state stay under the normal XDG user-data root.
3. You can also run ./pica-library or ./Pica\ Library.sh directly without installing.
4. Pica Library opens in your default browser in interactive mode. Use --headless for a persistent no-GUI local engine.
5. To remove only application/menu files, run the installed uninstall-linux-user.sh.
   The uninstaller intentionally preserves Pica Library user data.

Runtime baseline for this package:
- GNU/Linux x86-64
- glibc >= $MIN_GLIBC
- tested support baseline: kernel >= $SUPPORT_KERNEL
- Node.js official binary compatibility baseline: GLIBCXX_$MIN_GLIBCXX
- Alpine/musl is not supported by this glibc package.

The launcher checks architecture and glibc before starting Node.js. Kernels below
$SUPPORT_KERNEL are outside the tested baseline and produce a warning.

This is an experimental CI artifact, not a formal release.
Self-update is intentionally disabled on Linux at this stage.
Secure credential persistence uses Secret Service only when the current session can reach it.
Without a secure credential backend, credentials remain in memory for this run only.
Folder/save dialogs use zenity or kdialog when available; paths can always be entered manually.

No separate Node.js installation is required.
EOF

cat > "$STAGE/PLATFORM_REQUIREMENTS.json" <<EOF
{
  "schemaVersion": 1,
  "platform": "linux",
  "arch": "x64",
  "libc": "glibc",
  "minimumKernel": "$SUPPORT_KERNEL",
  "minimumGlibc": "$MIN_GLIBC",
  "minimumGlibcxxSymbol": "GLIBCXX_$MIN_GLIBCXX",
  "runtimeAbiObserved": {
    "maxRequiredGlibc": "$MAX_REQUIRED_GLIBC",
    "maxRequiredGlibcxx": "$MAX_REQUIRED_GLIBCXX"
  },
  "nodeVersion": "$NODE_VERSION",
  "formalRelease": false
}
EOF

printf '%s
' "$SOURCE_SHA" > "$STAGE/SOURCE_SHA.txt"

for required in   "$STAGE/runtime/bin/node"   "$STAGE/runtime/linux-preflight.sh"   "$STAGE/app/desktop.js"   "$STAGE/licenses/Node.js-LICENSE.txt"   "$STAGE/licenses/THIRD_PARTY_LICENSES.txt"   "$STAGE/web/index.html"   "$STAGE/LICENSE"   "$STAGE/SOURCE_SHA.txt"   "$STAGE/PLATFORM_REQUIREMENTS.json"   "$STAGE/install-linux-user.sh"   "$STAGE/uninstall-linux-user.sh"
do
  if [[ ! -s "$required" ]]; then
    echo "Required Linux package file is missing or empty: $required" >&2
    exit 1
  fi
done

if find "$STAGE" -type f \(   -name '.env' -o   -name '.env.*' -o   -name '*.db' -o   -name '*.db-wal' -o   -name '*.db-shm' -o   -name '*.sqlite' \) -print -quit | grep -q .; then
  echo "Forbidden user/developer data found in Linux package" >&2
  exit 1
fi
if find "$STAGE" -type d -name node_modules -print -quit | grep -q .; then
  echo "node_modules must not be shipped in Linux package" >&2
  exit 1
fi

(
  cd "$BUILD_ROOT"
  tar -czf "$ARCHIVE" "$NAME"
)

HASH="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
SIZE="$(stat -c '%s' "$ARCHIVE")"
FILE_COUNT="$(find "$STAGE" -type f | wc -l | tr -d ' ')"
UNCOMPRESSED="$(du -sb "$STAGE" | awk '{print $1}')"

cat > "$ROOT/artifacts/LINUX-EXPERIMENTAL-SHA256SUMS.txt" <<EOF
$HASH  $(basename "$ARCHIVE")
EOF

"$STAGE/runtime/bin/node" -e   "console.log(JSON.stringify({path:process.argv[1],sha256:process.argv[2],size_bytes:Number(process.argv[3]),uncompressed_bytes:Number(process.argv[4]),file_count:Number(process.argv[5]),node_version:process.argv[6],product_version:process.argv[7],source_sha:process.argv[8],minimum_glibc:process.argv[9],observed_max_glibc:process.argv[10],formal_release:false},null,2))"   "$ARCHIVE" "$HASH" "$SIZE" "$UNCOMPRESSED" "$FILE_COUNT" "$NODE_VERSION" "$PRODUCT_VERSION" "$SOURCE_SHA" "$MIN_GLIBC" "$MAX_REQUIRED_GLIBC"
