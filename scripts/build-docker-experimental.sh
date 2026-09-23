#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCT_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$ROOT/package.json")"
GIT_SHA="$(git -C "$ROOT" rev-parse HEAD)"
SOURCE_SHA="${PICA_LIBRARY_BUILD_PROVENANCE:-$GIT_SHA}"

if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Build provenance must be exactly 40 lowercase hex characters" >&2
  exit 1
fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Experimental Docker amd64 image must be built on Linux x86_64" >&2
  exit 1
fi

SHORT_SHA="${SOURCE_SHA:0:8}"
IMAGE="pica-library:${PRODUCT_VERSION}-${SHORT_SHA}-docker-amd64-experimental"
CONTEXT="$ROOT/artifacts/docker-context"
EXTRACT="$ROOT/artifacts/docker-package-extract"
ARCHIVE="$ROOT/artifacts/Pica-Library-v${PRODUCT_VERSION}-${SHORT_SHA}-docker-amd64-experimental.tar.gz"
SHA_FILE="$ROOT/artifacts/DOCKER-EXPERIMENTAL-SHA256SUMS.txt"
META_FILE="$ROOT/artifacts/DOCKER-EXPERIMENTAL-METADATA.json"
TAG_FILE="$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt"

rm -rf "$CONTEXT" "$EXTRACT"
rm -f "$ARCHIVE" "$SHA_FILE" "$META_FILE" "$TAG_FILE"
mkdir -p "$CONTEXT/package" "$EXTRACT" "$ROOT/artifacts"

bash "$ROOT/scripts/build-linux-experimental.sh"

LINUX_ARCHIVE="$(find "$ROOT/artifacts" -maxdepth 1 -type f -name 'Pica-Library-*-linux-x64-experimental.tar.gz' -print -quit)"
if [[ -z "$LINUX_ARCHIVE" ]]; then
  echo "Experimental Linux package was not produced" >&2
  exit 1
fi

tar -xzf "$LINUX_ARCHIVE" -C "$EXTRACT"
PACKAGE_ROOT="$(find "$EXTRACT" -mindepth 1 -maxdepth 1 -type d -name 'Pica-Library-*-linux-x64-experimental' -print -quit)"
if [[ -z "$PACKAGE_ROOT" ]]; then
  echo "Experimental Linux package root was not found" >&2
  exit 1
fi
cp -a "$PACKAGE_ROOT"/. "$CONTEXT/package/"

docker pull --quiet debian:bookworm-slim >/dev/null
BASE_DIGEST="$(docker image inspect debian:bookworm-slim --format '{{index .RepoDigests 0}}')"

docker build   --network=none   --file "$ROOT/packaging/docker/experimental/Dockerfile"   --build-arg "PICA_PRODUCT_VERSION=$PRODUCT_VERSION"   --build-arg "PICA_SOURCE_SHA=$SOURCE_SHA"   --tag "$IMAGE"   "$CONTEXT"

if [[ -n "$(docker image inspect "$IMAGE" --format '{{json .Config.ExposedPorts}}')" &&
      "$(docker image inspect "$IMAGE" --format '{{json .Config.ExposedPorts}}')" != "null" ]]; then
  echo "Experimental Docker image must not expose remote ports" >&2
  exit 1
fi

USER_VALUE="$(docker image inspect "$IMAGE" --format '{{.Config.User}}')"
if [[ "$USER_VALUE" != "10001:10001" ]]; then
  echo "Experimental Docker image must run as non-root 10001:10001" >&2
  exit 1
fi

ENTRYPOINT_JSON="$(docker image inspect "$IMAGE" --format '{{json .Config.Entrypoint}}')"
if [[ "$ENTRYPOINT_JSON" != *'"--headless"'* ]]; then
  echo "Experimental Docker image must launch in headless mode" >&2
  exit 1
fi

docker save "$IMAGE" | gzip -n -9 > "$ARCHIVE"
HASH="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
SIZE="$(stat -c '%s' "$ARCHIVE")"
IMAGE_ID="$(docker image inspect "$IMAGE" --format '{{.Id}}')"

printf '%s  %s\n' "$HASH" "$(basename "$ARCHIVE")" > "$SHA_FILE"
printf '%s\n' "$IMAGE" > "$TAG_FILE"

node - "$META_FILE" "$IMAGE" "$IMAGE_ID" "$HASH" "$SIZE" "$PRODUCT_VERSION" "$SOURCE_SHA" "$BASE_DIGEST" <<'NODE'
const fs=require('fs')
const [file,image,imageId,sha256,size,version,sourceSha,baseDigest]=process.argv.slice(2)
fs.writeFileSync(file,JSON.stringify({
  image,
  image_id:imageId,
  sha256,
  size_bytes:Number(size),
  product_version:version,
  source_sha:sourceSha,
  base_image:baseDigest,
  architecture:'amd64',
  headless:true,
  remote_web_exposed:false,
  formal_release:false
},null,2)+'\n')
NODE

echo "Docker experimental image: $IMAGE"
echo "Docker experimental archive: $ARCHIVE"
echo "Docker experimental SHA256: $HASH"
