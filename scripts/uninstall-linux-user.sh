#!/usr/bin/env bash
set -euo pipefail

XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_ROOT="${PICA_LIBRARY_INSTALL_ROOT:-$HOME/.local/opt/pica-library}"
DATA_ROOT="${PICA_LIBRARY_DESKTOP_HOME:-$XDG_DATA_HOME/pica-library}"
DESKTOP_DIR="$XDG_DATA_HOME/applications"
DESKTOP_FILE="$DESKTOP_DIR/org.picalibrary.PicaLibrary.desktop"
ICON_FILE="$XDG_DATA_HOME/icons/hicolor/scalable/apps/org.picalibrary.PicaLibrary.svg"

normalize() {
  realpath -m "$1"
}

INSTALL_ROOT="$(normalize "$INSTALL_ROOT")"
DATA_ROOT="$(normalize "$DATA_ROOT")"

case "$DATA_ROOT/" in
  "$INSTALL_ROOT/"*)
    echo "Refusing uninstall: application root contains the Pica Library user-data root." >&2
    exit 1
    ;;
esac
case "$INSTALL_ROOT/" in
  "$DATA_ROOT/"*)
    echo "Refusing uninstall: application root is inside the Pica Library user-data root." >&2
    exit 1
    ;;
esac

if [[ "$INSTALL_ROOT" == "/" || "$INSTALL_ROOT" == "$HOME" ]]; then
  echo "Refusing unsafe application uninstall root: $INSTALL_ROOT" >&2
  exit 1
fi

if [[ -e "$INSTALL_ROOT" ]]; then
  MARKER="$INSTALL_ROOT/.pica-library-install-root"
  if [[ ! -s "$MARKER" ]] || [[ "$(head -n 1 "$MARKER")" != "pica-library-linux-user-install" ]]; then
    echo "Refusing uninstall: target is not a recognized Pica Library Linux user install: $INSTALL_ROOT" >&2
    exit 1
  fi
  SOURCE_SHA="$(sed -n '2p' "$MARKER" | tr -d '\r\n')"
  if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Refusing uninstall: install-root provenance marker is invalid." >&2
    exit 1
  fi
fi

rm -f "$DESKTOP_FILE" "$ICON_FILE"
rm -rf "$INSTALL_ROOT"

if command -v update-desktop-database >/dev/null 2>&1 && [[ -d "$DESKTOP_DIR" ]]; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1 && [[ -d "$XDG_DATA_HOME/icons/hicolor" ]]; then
  gtk-update-icon-cache -f -t "$XDG_DATA_HOME/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "Pica Library Linux preview application files were removed."
echo "User data was not removed: $DATA_ROOT"
