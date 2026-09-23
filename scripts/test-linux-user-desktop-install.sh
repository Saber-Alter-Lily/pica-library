#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <linux-experimental.tar.gz>" >&2
  exit 2
fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Linux desktop-install acceptance requires Linux x86-64" >&2
  exit 1
fi
if ! command -v desktop-file-validate >/dev/null 2>&1; then
  echo "desktop-file-validate is required for Linux desktop-install acceptance" >&2
  exit 2
fi

WORK="$(mktemp -d)"
ENGINE_PID=""
URL=""
cleanup() {
  if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  echo "Linux user desktop-install acceptance: $*" >&2
  [[ -f "$WORK/engine.log" ]] && cat "$WORK/engine.log" >&2 || true
  exit 1
}

tar -xzf "$ARCHIVE" -C "$WORK"
PACKAGE_ROOT="$(
  find "$WORK" -mindepth 1 -maxdepth 1 -type d     -name 'Pica-Library-*-linux-x64-experimental' -print -quit
)"
[[ -n "$PACKAGE_ROOT" ]] || fail "package root not found"

for required in   "$PACKAGE_ROOT/install-linux-user.sh"   "$PACKAGE_ROOT/uninstall-linux-user.sh"   "$PACKAGE_ROOT/pica-library"   "$PACKAGE_ROOT/runtime/bin/node"   "$PACKAGE_ROOT/app/desktop.js"   "$PACKAGE_ROOT/web/pica-library-icon.webp"
do
  [[ -s "$required" ]] || fail "package is missing $required"
done

export HOME="$WORK/home with space"
export XDG_DATA_HOME="$HOME/.local/share"
export PICA_LIBRARY_INSTALL_ROOT="$HOME/.local/opt/pica-library"
unset PICA_LIBRARY_DESKTOP_HOME
mkdir -p "$HOME"

INSTALL_ROOT="$PICA_LIBRARY_INSTALL_ROOT"
DATA_ROOT="$XDG_DATA_HOME/pica-library"
DESKTOP_FILE="$XDG_DATA_HOME/applications/org.picalibrary.PicaLibrary.desktop"
ICON_FILE="$XDG_DATA_HOME/icons/hicolor/scalable/apps/org.picalibrary.PicaLibrary.svg"

bash "$PACKAGE_ROOT/install-linux-user.sh" > "$WORK/install.log"

[[ -x "$INSTALL_ROOT/pica-library" ]] || fail "installed launcher missing"
[[ -x "$INSTALL_ROOT/uninstall-linux-user.sh" ]] || fail "installed uninstaller missing"
[[ -s "$DESKTOP_FILE" ]] || fail "XDG desktop entry missing"
[[ -s "$ICON_FILE" ]] || fail "XDG hicolor icon missing"
desktop-file-validate "$DESKTOP_FILE"

grep -Fq 'Name=Pica Library' "$DESKTOP_FILE" || fail "desktop entry name missing"
grep -Fq 'Icon=org.picalibrary.PicaLibrary' "$DESKTOP_FILE" || fail "desktop icon identity mismatch"
grep -Fq 'Terminal=false' "$DESKTOP_FILE" || fail "desktop entry unexpectedly opens a terminal"
grep -Fq 'Categories=Graphics;Viewer;' "$DESKTOP_FILE" || fail "desktop entry categories mismatch"
grep -Fq "Exec=\"$INSTALL_ROOT/pica-library\"" "$DESKTOP_FILE" || fail "desktop Exec path was not quoted correctly"
grep -Fq 'data:image/webp;base64,' "$ICON_FILE" || fail "installed SVG does not embed the packaged brand icon"

PACKAGE_SHA="$(tr -d '\r\n' < "$PACKAGE_ROOT/SOURCE_SHA.txt")"
INSTALL_SHA="$(tr -d '\r\n' < "$INSTALL_ROOT/SOURCE_SHA.txt")"
[[ "$PACKAGE_SHA" == "$INSTALL_SHA" ]] || fail "installed application provenance mismatch"

case "$DATA_ROOT/" in
  "$INSTALL_ROOT/"*) fail "user data root is inside the application install root" ;;
esac
case "$INSTALL_ROOT/" in
  "$DATA_ROOT/"*) fail "application install root is inside the user data root" ;;
esac

start_engine() {
  : > "$WORK/engine.log"
  "$INSTALL_ROOT/pica-library" --headless --no-open >"$WORK/engine.log" 2>&1 &
  ENGINE_PID="$!"
  local instance="$DATA_ROOT/runtime-state/instance.json"
  URL=""
  for _ in $(seq 1 120); do
    if [[ -f "$instance" ]]; then
      URL="$(
        "$INSTALL_ROOT/runtime/bin/node" -e           "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.url||''))}catch{}"           "$instance"
      )"
      if [[ -n "$URL" ]] && curl --fail --silent "$URL/api/v1/desktop/status" >/dev/null 2>&1; then
        return 0
      fi
    fi
    if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      fail "installed Desktop engine exited during startup"
    fi
    sleep 0.25
  done
  fail "installed Desktop engine did not become healthy"
}

stop_engine() {
  curl --fail --silent "$URL/api/v1/desktop/status" > "$WORK/status.json"
  local token
  token="$(
    "$INSTALL_ROOT/runtime/bin/node" -e       "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(v.csrfToken||''))"       "$WORK/status.json"
  )"
  [[ -n "$token" ]] || fail "Desktop CSRF token missing"
  curl --fail --silent     -X POST     -H "content-type: application/json"     -H "x-pica-csrf: $token"     -H "Origin: $URL"     --data '{}'     "$URL/api/v1/desktop/shutdown" >/dev/null

  for _ in $(seq 1 80); do
    if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
      ENGINE_PID=""
      URL=""
      return 0
    fi
    sleep 0.25
  done
  fail "installed Desktop engine did not stop cleanly"
}

start_engine
curl --fail --silent "$URL/api/v1/capabilities" > "$WORK/capabilities.json"
"$INSTALL_ROOT/runtime/bin/node" - "$WORK/capabilities.json" <<'NODE'
const fs=require('fs')
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const assert=(condition,message)=>{if(!condition)throw new Error(message)}
assert(value.runtime?.platform==='linux','installed runtime platform mismatch')
assert(value.runtime?.arch==='x64','installed runtime architecture mismatch')
assert(value.runtime?.mode==='headless','installed runtime mode mismatch')
assert(value.features?.updatePackages===false,'Linux desktop preview must not advertise self-update')
NODE
stop_engine

[[ -f "$DATA_ROOT/data/library.db" ]] || fail "installed app did not use the external XDG data root"
printf 'preserve-me\n' > "$DATA_ROOT/desktop-install-sentinel.txt"
printf 'stale-application-file\n' > "$INSTALL_ROOT/stale-preview-file.txt"

# Reinstall from the extracted candidate to exercise application-tree replacement.
bash "$PACKAGE_ROOT/install-linux-user.sh" > "$WORK/reinstall.log"
[[ ! -e "$INSTALL_ROOT/stale-preview-file.txt" ]] || fail "reinstall did not replace the old application tree"
[[ -f "$DATA_ROOT/desktop-install-sentinel.txt" ]] || fail "reinstall removed external user data"
[[ "$(tr -d '\r\n' < "$INSTALL_ROOT/SOURCE_SHA.txt")" == "$PACKAGE_SHA" ]] || fail "reinstall provenance mismatch"
desktop-file-validate "$DESKTOP_FILE"

start_engine
curl --fail --silent "$URL/api/v1/desktop/status" > "$WORK/status-after-reinstall.json"
stop_engine

UNINSTALLER="$INSTALL_ROOT/uninstall-linux-user.sh"
bash "$UNINSTALLER" > "$WORK/uninstall.log"

[[ ! -e "$INSTALL_ROOT" ]] || fail "uninstaller left application files behind"
[[ ! -e "$DESKTOP_FILE" ]] || fail "uninstaller left desktop entry behind"
[[ ! -e "$ICON_FILE" ]] || fail "uninstaller left desktop icon behind"
[[ -f "$DATA_ROOT/data/library.db" ]] || fail "uninstaller removed the user database"
[[ -f "$DATA_ROOT/desktop-install-sentinel.txt" ]] || fail "uninstaller removed preserved user data"

echo "Linux user desktop-install acceptance: PASS"
