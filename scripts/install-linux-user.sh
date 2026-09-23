#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_ROOT="${PICA_LIBRARY_INSTALL_ROOT:-$HOME/.local/opt/pica-library}"
DATA_ROOT="${PICA_LIBRARY_DESKTOP_HOME:-$XDG_DATA_HOME/pica-library}"
DESKTOP_DIR="$XDG_DATA_HOME/applications"
DESKTOP_FILE="$DESKTOP_DIR/org.picalibrary.desktop.desktop"

normalize() {
  realpath -m "$1"
}

INSTALL_ROOT="$(normalize "$INSTALL_ROOT")"
DATA_ROOT="$(normalize "$DATA_ROOT")"

case "$DATA_ROOT/" in
  "$INSTALL_ROOT/"*)
    echo "Refusing install: application root would contain the Pica Library user-data root." >&2
    exit 1
    ;;
esac
case "$INSTALL_ROOT/" in
  "$DATA_ROOT/"*)
    echo "Refusing install: application root would be inside the Pica Library user-data root." >&2
    exit 1
    ;;
esac

if [[ "$INSTALL_ROOT" == "/" || "$INSTALL_ROOT" == "$HOME" ]]; then
  echo "Refusing unsafe application install root: $INSTALL_ROOT" >&2
  exit 1
fi

PARENT="$(dirname "$INSTALL_ROOT")"
STAGING="$PARENT/.pica-library-install-$$"
BACKUP="$PARENT/.pica-library-backup-$$"
DESKTOP_TMP="$DESKTOP_FILE.tmp.$$"
DESKTOP_BACKUP="$DESKTOP_FILE.backup.$$"
SWAPPED=false
DESKTOP_SWAPPED=false

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    if [[ "$DESKTOP_SWAPPED" == true ]]; then
      rm -f "$DESKTOP_FILE"
      if [[ -f "$DESKTOP_BACKUP" ]]; then
        mv "$DESKTOP_BACKUP" "$DESKTOP_FILE"
      fi
    fi
    if [[ "$SWAPPED" == true ]]; then
      rm -rf "$INSTALL_ROOT"
      if [[ -d "$BACKUP" ]]; then
        mv "$BACKUP" "$INSTALL_ROOT"
      fi
    fi
  fi
  rm -rf "$STAGING"
  rm -f "$DESKTOP_TMP" "$DESKTOP_BACKUP"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$PARENT" "$DESKTOP_DIR"

if [[ "$SOURCE_ROOT" != "$INSTALL_ROOT" ]]; then
  rm -rf "$STAGING" "$BACKUP"
  mkdir -p "$STAGING"
  cp -a "$SOURCE_ROOT"/. "$STAGING"/

  for required in pica-library app/desktop.js runtime/bin/node web/index.html SOURCE_SHA.txt; do
    if [[ ! -s "$STAGING/$required" ]]; then
      echo "Install payload is missing: $required" >&2
      exit 1
    fi
  done

  if [[ -d "$INSTALL_ROOT" ]]; then
    mv "$INSTALL_ROOT" "$BACKUP"
  fi
  mv "$STAGING" "$INSTALL_ROOT"
  SWAPPED=true
fi

desktop_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\\$}"
  value="${value//\`/\\\`}"
  printf '"%s"' "$value"
}

EXEC_PATH="$(desktop_quote "$INSTALL_ROOT/pica-library")"
ICON_PATH="$INSTALL_ROOT/web/pica-library-icon.webp"

cat > "$DESKTOP_TMP" <<EOF
[Desktop Entry]
Type=Application
Name=Pica Library
Comment=Local-first manga library, reader and download manager
Exec=$EXEC_PATH
TryExec=$INSTALL_ROOT/pica-library
Icon=$ICON_PATH
Terminal=false
Categories=Graphics;Viewer;
Keywords=Manga;Comic;Reader;Library;
StartupNotify=true
EOF

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$DESKTOP_TMP"
fi

if [[ -f "$DESKTOP_FILE" ]]; then
  cp -p "$DESKTOP_FILE" "$DESKTOP_BACKUP"
fi
mv "$DESKTOP_TMP" "$DESKTOP_FILE"
DESKTOP_SWAPPED=true
chmod 0644 "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

rm -rf "$BACKUP"
rm -f "$DESKTOP_BACKUP"
SWAPPED=false
DESKTOP_SWAPPED=false
trap - EXIT

echo "Pica Library Linux preview installed."
echo "Application: $INSTALL_ROOT"
echo "Desktop entry: $DESKTOP_FILE"
echo "User data remains separate at: $DATA_ROOT"
