#!/bin/sh
# harns: points adb at this session's Simulator, then runs this machine's own adb.

self_dir=$(cd "$(dirname "$0")" && pwd)
real=
old_ifs=$IFS; IFS=:
for dir in $PATH; do
  [ "$dir" = "$self_dir" ] && continue
  if [ -x "$dir/adb" ]; then real="$dir/adb"; break; fi
done
IFS=$old_ifs
for dir in "$ANDROID_HOME" "$ANDROID_SDK_ROOT" "$HOME/Android/Sdk"; do
  [ -z "$real" ] && [ -n "$dir" ] && [ -x "$dir/platform-tools/adb" ] && real="$dir/platform-tools/adb"
done
if [ -z "$real" ]; then echo "adb: not found (harns's ~/.local/bin/adb runs the real one)" >&2; exit 127; fi

map="$HOME/.config/harness/devices"
mine=
if [ -n "$HC_TERMINAL_ID" ] && [ -f "$map" ]; then
  mine=$(awk -v t="$HC_TERMINAL_ID" '$1 == t { print $2; exit }' "$map")
fi
if [ -z "$ANDROID_SERIAL" ] && [ -n "$mine" ]; then
  ANDROID_SERIAL=$mine
  export ANDROID_SERIAL
elif [ -z "$ANDROID_SERIAL" ] && [ -n "$HC_TERMINAL_ID" ] && [ -s "$map" ]; then
  others=$("$real" devices 2>/dev/null | awk -v map="$map" '
    BEGIN { while ((getline line < map) > 0) { split(line, f, " "); if (f[2] != "") harns[f[2]] = 1 } }
    NR > 1 && $2 == "device" && !($1 in harns) { print $1 }')
  count=$(printf '%s\n' "$others" | grep -c .)
  if [ "$count" -eq 1 ]; then ANDROID_SERIAL=$others; export ANDROID_SERIAL
  elif [ "$count" -eq 0 ]; then ANDROID_SERIAL=no-harns-simulator-for-this-session; export ANDROID_SERIAL; fi
fi

if [ "$1" = devices ] && [ -n "$HC_TERMINAL_ID" ] && [ -f "$map" ]; then
  out=$("$real" "$@"); status=$?
  printf '%s\n' "$out" | awk -v mine="$mine" -v map="$map" '
    BEGIN { while ((getline line < map) > 0) { split(line, f, " "); if (f[2] != "") harns[f[2]] = 1 } }
    NR == 1 { print; next }
    ($1 in harns) && $1 != mine { next }
    { print }
    END { if (mine == "") print "# No harns Simulator for this session yet: start one from the Simulator panel in harns." > "/dev/stderr" }'
  exit $status
fi
exec "$real" "$@"
