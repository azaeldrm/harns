#!/bin/sh
# Runs scripts/install.py with the first Python 3 that starts. Each one is tried, since on
# Windows `python3` can be the Microsoft Store placeholder, which exists but doesn't run.
set -e
dir=$(dirname "$0")
for python in python3 python 'py -3'; do
  if $python -c 'import sys; sys.exit(sys.version_info[0] != 3)' >/dev/null 2>&1; then
    exec $python "$dir/scripts/install.py" "$@"
  fi
done
echo 'error: Python 3 was not found. Install it first.' >&2
exit 1
