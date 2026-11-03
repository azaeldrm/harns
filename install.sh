#!/bin/sh
# Installs the Harness layout into herdr (Linux and macOS). See scripts/install.py.
# --no-switch installs without switching to the layout.
set -e
for python in python3 python; do
  if command -v "$python" >/dev/null 2>&1; then
    exec "$python" "$(dirname "$0")/scripts/install.py" "$@"
  fi
done
echo 'error: Python 3 was not found. Install it first.' >&2
exit 1
