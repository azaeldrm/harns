#!/bin/sh
set -e
dir=$(dirname "$0")
for python in python3 python 'py -3'; do
  if $python -c 'import sys; sys.exit(sys.version_info[0] != 3)' >/dev/null 2>&1; then
    exec $python "$dir/scripts/install.py" "$@"
  fi
done
echo 'error: Python 3 was not found. Install it first.' >&2
exit 1
