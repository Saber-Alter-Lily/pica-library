#!/usr/bin/env bash
set -euo pipefail

MIN_GLIBC="2.28"
SUPPORT_KERNEL="4.18"

version_ge() {
  local current="$1"
  local minimum="$2"
  local IFS=.
  local -a left=($current)
  local -a right=($minimum)
  local index a b
  for index in 0 1 2 3; do
    a="${left[$index]:-0}"
    b="${right[$index]:-0}"
    a="${a%%[^0-9]*}"
    b="${b%%[^0-9]*}"
    [[ -n "$a" ]] || a=0
    [[ -n "$b" ]] || b=0
    if ((10#$a > 10#$b)); then return 0; fi
    if ((10#$a < 10#$b)); then return 1; fi
  done
  return 0
}

machine="$(uname -m)"
if [[ "$machine" != "x86_64" && "$machine" != "amd64" ]]; then
  echo "Pica Library Linux x64 preview requires an x86-64 system; detected: $machine" >&2
  exit 1
fi

glibc_line="$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
if [[ ! "$glibc_line" =~ ^glibc[[:space:]]+([0-9]+(\.[0-9]+)+)$ ]]; then
  echo "Pica Library Linux x64 preview requires GNU glibc >= $MIN_GLIBC. This package does not support musl/Alpine." >&2
  exit 1
fi
glibc_version="${BASH_REMATCH[1]}"
if ! version_ge "$glibc_version" "$MIN_GLIBC"; then
  echo "Pica Library Linux x64 preview requires glibc >= $MIN_GLIBC; detected: $glibc_version" >&2
  exit 1
fi

kernel_version="$(uname -r | sed 's/-.*$//')"
if ! version_ge "$kernel_version" "$SUPPORT_KERNEL"; then
  echo "Warning: Pica Library's tested Linux support baseline is kernel >= $SUPPORT_KERNEL; detected: $kernel_version. Continuing outside the tested baseline." >&2
fi
