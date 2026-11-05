#!/bin/sh
set -e
for python in python3 python; do
  if command -v "$python" >/dev/null 2>&1; then
    exec "$python" "$(dirname "$0")/scripts/install.py" "$@"
  fi
done
echo 'error: Python 3 was not found. Install it first.' >&2
exit 1
