import { exec, appHome } from "herdr";

const sh = (script, ...args) => exec("sh", ["-c", script, "harns", ...args]);
const DETACH = 'setsid "$@" > /dev/null 2>&1 < /dev/null &';

export async function linuxHost() {
  // The Simulator's Linux side: the Android SDK in ~/Android/Sdk (or ANDROID_HOME), programs started detached, tunnels
  // through OpenSSH, and on Hyprland dock-hyprland.py placing the device windows (other desktops show them in their own).
  const r = await sh('printf "%s|%s|%s|%s|%s" "$ANDROID_HOME" "$ANDROID_SDK_ROOT" "$ANDROID_AVD_HOME" "$HOME" "$HYPRLAND_INSTANCE_SIGNATURE"');
  const [home, root, avds, user, hyprland] = r.stdout.split("|");
  const sdk = home || root || `${user}/Android/Sdk`;
  const cache = `${appHome()}/cache/harness-simulator`;
  const host = {
    sep: "/",
    sdk,
    adb: `${sdk}/platform-tools/adb`,
    emulator: `${sdk}/emulator/emulator`,
    avdHome: avds || `${user}/.android/avd`,
    cache,
    stateFile: `${cache}/dock-state.txt`,
    docks: Boolean(hyprland),
    noSdk: "No Android emulator found in ~/Android/Sdk. Install the SDK's emulator, or set ANDROID_HOME (README: Simulator setup).",

    start(program, args) { return sh(DETACH, program, ...args); },

    kill(pid) { return exec("kill", [String(pid)]).catch(() => {}); },

    closeTunnels() { return exec("pkill", ["-f", "SetEnv=HARNS=harns-simulator"]).catch(() => {}); },

    async openTunnel(target, port, local) {
      // An SSH reverse tunnel to `target`, its 127.0.0.1:<port> to this computer's <local>; its pid, or null when it
      // exited (that port is taken there, or ssh can't log in).
      const t = await sh('setsid ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 ' +
        '-o SetEnv=HARNS=harns-simulator -R "$1" "$2" > /dev/null 2>&1 < /dev/null & p=$!; sleep 2.5; ' +
        'if kill -0 "$p" 2> /dev/null; then echo "$p"; else echo exited; fi', `127.0.0.1:${port}:127.0.0.1:${local}`, target);
      return Number(t.stdout.trim()) || null;
    },

    async copyDevice(base, name) {
      // Another virtual device like `base`: its config.ini without its data, so it boots fresh.
      const c = await sh('d="$1"; src="$d/$2.avd"; dst="$d/$3.avd"; mkdir -p "$dst" && ' +
        '{ grep -Ev "^(AvdId|avd\\.ini\\.displayname)[[:space:]]*=" "$src/config.ini"; printf "AvdId=%s\\navd.ini.displayname=%s\\n" "$3" "$3"; } > "$dst/config.ini" && ' +
        '{ printf "avd.ini.encoding=UTF-8\\npath=%s\\npath.rel=avd/%s.avd\\n" "$dst" "$3"; grep "^target=" "$d/$2.ini"; } > "$d/$3.ini"',
        host.avdHome, base, name);
      if (c.code !== 0) throw new Error(c.stderr.trim().split("\n")[0] || "couldn't copy the virtual device");
    },

    async startDock() {
      // A fresh dock-hyprland.py (a previous one is ended, leaving its windows to this one).
      await exec("pkill", ["-KILL", "-f", "harness-simulator/dock-hyprland.py"]).catch(() => {});
      const s = await sh(DETACH, "python3", `${appHome()}/mods/harness-simulator/dock-hyprland.py`, "run", host.stateFile, `${appHome()}/herdr-app.sock`);
      if (s.code !== 0) throw new Error(s.stderr.trim().split("\n")[0] || "Couldn't start the dock helper");
    },
  };
  return host;
}
