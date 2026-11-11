// Harness's Simulator: an Android emulator in the right-hand panel, beside Files and Changes.
//
// The device isn't drawn by this mod. The emulator's own window sits over the panel's screen
// area (harns-dock, built from dock.cs on first use), so it runs at the emulator's own frame
// rate with its own mouse and keyboard input, and nothing here runs per frame. This mod only
// says where that area is, in a small state file, when it moves or shows or hides; the helper
// follows herdr's window by itself.
//
// Windows only for now: the iOS Simulator needs a Mac, and docking a window is per platform.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, hc, appHome, readTextFile, layout, settings, window, theme, spaces, machines } from "herdr";
import * as fs from "fs/promises";

const BLOCK = "simulator";
const PAD = 12;           // around the screen area, in the mod's px (herdr zooms them)
const BORDER = 1;         // the card's border, as on Files and Changes
const POLL = 4000;        // how often the device list is read while the panel shows (ms)
const SHARE_PORT = 15555; // the first port tried on another machine for the emulator's adb

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function insets(node, id) {
  // How far block `id` sits from the window's right and bottom edges, in layout px, from the
  // px sizes of what comes after it. Null when something after it has no fixed size.
  if (node?.id === id) return { right: 0, bottom: 0 };
  const kids = node?.children ?? [];
  for (let i = 0; i < kids.length; i++) {
    const inner = insets(kids[i], id);
    if (!inner) continue;
    if (node.type === "stack") return inner;
    const pad = typeof node.padding === "number" ? node.padding : 0, gap = node.gap ?? 0;
    let after = 0;
    for (const k of kids.slice(i + 1)) {
      if (k.hidden) continue;
      if (!k.size?.px) return null;
      after += k.size.px + gap;
    }
    return node.type === "row"
      ? { right: inner.right + pad + after, bottom: inner.bottom + pad }
      : { right: inner.right + pad, bottom: inner.bottom + pad + after };
  }
  return null;
}

const ANDROID = { 29: "10", 30: "11", 31: "12", 32: "12L", 33: "13", 34: "14", 35: "15", 36: "16" };
const hash = text => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const quote = s => `'${String(s).replace(/'/g, "''")}'`;   // a PowerShell literal
const zoom = () => Number(settings()?.zoom) || 1;   // herdr scales the mod's px by this
const ps = script => exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);

export default class Simulator extends View {
  init(_props, cx) {
    this.area = null;            // the screen area's size, real logical px
    this.avds = [];              // virtual devices that can start
    this.info = {};              // avd -> { width, height, label }, from its config.ini
    this.device = null;          // the running emulator: { serial, avd, width, height }
    this.status = "Looking for the Android SDK…";
    this.busy = null;            // "starting" | "stopping" while that runs
    this.mode = "dock";          // "dock": in the panel; "window": a window of its own
    try { this.mode = localStorage.getItem("mode") === "window" ? "window" : "dock"; } catch {}
    this.helper = false;         // a harns-dock is running for this device
    this.written = null;         // the state file's last contents
    this.shares = {};            // machine -> { pid, port, error? } | { error }: shared there
    this.declined = new Set();   // machines the user stopped sharing with, until it restarts
    if (window()?.platform !== "windows") { this.status = "The Simulator panel runs on Windows for now."; return; }
    cx.spawn(async cx => {
      await this.setup();
      cx.notify();
      for (;;) {
        if (this.shown() || this.busy) { await this.refresh(); cx.notify(); }
        if (await this.shareActive()) cx.notify();
        await cx.sleep(this.busy ? 1500 : POLL);
      }
    });
    // Whether the panel shows is read from the layout. A hidden stack child may not render, so a
    // light timer keeps the device window in step with it (no programs run here).
    cx.timer.every(200, () => this.place());
  }

  async close() {
    // The panel's slot went away (another layout, or quitting): the device window hides with it,
    // and its tunnels close (the other machines see the device go offline).
    this.place(false);
    for (const share of Object.values(this.shares)) if (share.pid) exec("taskkill", ["/PID", String(share.pid), "/F"]).catch(() => {});
    this.shares = {};
  }

  async setup() {
    const r = await ps("Write-Output \"$env:ANDROID_HOME|$env:ANDROID_SDK_ROOT|$env:LOCALAPPDATA|$env:WINDIR\"");
    const [home, root, local, win] = r.stdout.trim().split("|");
    this.sdk = home || root || (local ? `${local}\\Android\\Sdk` : null);
    this.windir = win || "C:\\Windows";
    this.adb = `${this.sdk}\\platform-tools\\adb.exe`;
    this.emulator = `${this.sdk}\\emulator\\emulator.exe`;
    this.cache = `${appHome()}\\cache\\harness-simulator`;
    this.stateFile = `${this.cache}\\dock-state.txt`;
    await fs.mkdir(this.cache, { recursive: true }).catch(() => {});
    // Tunnels a previous copy of this mod left (a reload, or a crash) close; they open again.
    await ps(`Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object { $_.CommandLine -like '*harns-simulator*' } | ` +
      `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`).catch(() => {});
    const list = await exec(this.emulator, ["-list-avds"]).catch(() => null);
    if (!list || list.code !== 0) { this.status = "No Android emulator found. Install the Android SDK's emulator, or set ANDROID_HOME."; return; }
    this.avds = list.stdout.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("INFO"));
    for (const avd of this.avds) await this.avdInfo(avd);
    this.status = this.avds.length ? "" : "No virtual devices yet. Create one in Android Studio's Device Manager, or with avdmanager.";
    await this.refresh();
  }

  async avdInfo(avd) {
    // From the virtual device's config.ini, known before it boots: its screen size, and a
    // label to show for it ("Pixel 5 · Android 15") instead of its file name. The emulator
    // rewrites the file with spaces around "=", Android Studio without.
    if (this.info[avd]) return this.info[avd];
    const r = await ps(`$d = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } else { Join-Path $HOME '.android\\avd' }; ` +
      `Get-Content -LiteralPath (Join-Path $d ${quote(`${avd}.avd\\config.ini`)}) -ErrorAction SilentlyContinue`).catch(() => null);
    const key = name => new RegExp(`^${name.replace(/\./g, "\\.")}\\s*=\\s*(.*)$`, "m").exec(r?.stdout ?? "")?.[1]?.trim();
    const width = Number(key("hw.lcd.width")) || 0, height = Number(key("hw.lcd.height")) || 0;
    const device = (key("hw.device.name") ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || avd.replace(/_/g, " ");
    const api = /android-(\d+)/.exec(key("image.sysdir.1") ?? "")?.[1];
    const label = api ? `${device} · Android ${ANDROID[api] ?? `API ${api}`}` : device;
    const info = { width, height, label };
    if (r) this.info[avd] = info;
    return info;
  }

  label(avd) { return this.info[avd]?.label ?? avd; }

  async refresh() {
    // The running emulator, if any (the first one adb lists). Short timeouts throughout:
    // `adb shell` commands wait while Android is still booting.
    const r = await exec(this.adb, ["devices"], { timeout: 5000 }).catch(() => null);
    const serial = r?.stdout.split(/\r?\n/).map(l => l.split(/\s+/)).find(([s, state]) => /^emulator-\d+$/.test(s) && state === "device")?.[0];
    if (!serial) {
      // While one starts, adb doesn't list it yet: keep what start() set.
      if (this.device && this.busy !== "starting") { this.device = null; this.helper = false; await this.unshareAll(); }
      return;
    }
    if (this.device?.serial !== serial || !this.device.width) {
      const name = await exec(this.adb, ["-s", serial, "emu", "avd", "name"], { timeout: 5000 }).catch(() => null);
      const avd = name?.stdout.split(/\r?\n/)[0]?.trim() || serial;
      let size = this.device?.avd === avd && this.device.width ? this.device : await this.avdInfo(avd);
      if (!size.width) {
        const booted = await exec(this.adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"], { timeout: 5000 }).catch(() => null);
        const out = booted?.stdout.trim() === "1"
          ? (await exec(this.adb, ["-s", serial, "shell", "wm", "size"], { timeout: 5000 }).catch(() => null))?.stdout ?? "" : "";
        const m = /Override size: (\d+)x(\d+)/.exec(out) ?? /Physical size: (\d+)x(\d+)/.exec(out);
        size = m ? { width: +m[1], height: +m[2] } : { width: 0, height: 0 };
      }
      this.device = { serial, avd, width: size.width, height: size.height };
    }
    if (this.mode === "dock" && !this.helper && !this.busy) await this.dock();
  }

  // Sharing with other machines. An agent on another machine drives this emulator with its own
  // adb: an SSH reverse tunnel (Windows' OpenSSH, with the ssh config herdr's machines use) brings
  // that machine's 127.0.0.1:<port> to the emulator's adb port here, and that machine's adb
  // server connects to it, so the emulator is one more device in its list, beside any phones.
  // Bound to localhost there; nothing listens on the network. It happens on its own while the
  // emulator runs and a space on that machine is shown, and lasts until the emulator stops.

  remembered(update) {
    // The machines it's shared with, kept across reloads and restarts of herdr (the emulator
    // outlives both), so agents there keep the device without anyone revisiting their space.
    let list = [];
    try { list = JSON.parse(localStorage.getItem("shared") ?? "[]"); } catch {}
    if (update) { list = update(list); try { localStorage.setItem("shared", JSON.stringify(list)); } catch {} }
    return list;
  }

  async shareActive() {
    // Shares with the shown space's machine, if it's another one, and with the machines it was
    // shared with before. True when something changed.
    const d = this.device;
    if (!d?.serial || this.busy) return false;
    const want = [spaces().find(s => s.active)?.machine, ...this.remembered()];
    const m = want.find(m => m && !this.shares[m] && !this.declined.has(m) && machines().find(x => x.name === m)?.layout === "ready");
    if (!m) return false;
    this.shares[m] = { pending: true };
    this.shares[m] = await this.share(m, d).catch(err => ({ error: String(err?.message ?? err).split("\n")[0] }));
    if (!this.shares[m].error) this.remembered(list => list.includes(m) ? list : [...list, m]);
    return true;
  }

  async share(m, d) {
    const list = await hc(["machine", "ls", "--json"]);
    const info = JSON.parse(list.stdout || "{}").machines?.find(x => x.name === m);
    if (!info) throw new Error("not one of herdr's machines");
    if (info.via) throw new Error("connected through a command, not ssh");
    const local = Number(d.serial.split("-")[1]) + 1;   // emulator-5554: console 5554, adb 5555
    const ssh = `${this.windir}\\System32\\OpenSSH\\ssh.exe`;
    for (let port = SHARE_PORT; port < SHARE_PORT + 5; port++) {
      // SetEnv names the tunnel, so a later copy of the mod can find and close it.
      const r = await ps(`$p = Start-Process -WindowStyle Hidden -PassThru -FilePath ${quote(ssh)} -ArgumentList ` +
        `'-N','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3',` +
        `'-o','SetEnv=HARNS=harns-simulator','-R',${quote(`127.0.0.1:${port}:127.0.0.1:${local}`)},${quote(info.target)}; ` +
        `Start-Sleep -Milliseconds 2500; if ($p.HasExited) { 'exited' } else { $p.Id }`);
      const pid = Number(r.stdout.trim());
      if (!pid) continue;   // that port is taken there (or ssh can't log in): the next one
      const c = await exec("adb", ["connect", `127.0.0.1:${port}`], { on: m, timeout: 10000 })
        .catch(() => ({ code: 1, stdout: "", stderr: "adb isn't installed there" }));
      if (/connected to/.test(c.stdout)) return { pid, port };
      return { pid, port, error: (c.stderr || c.stdout).trim().split("\n")[0] || "adb couldn't connect" };
    }
    throw new Error("couldn't open a tunnel (ssh to it needs to work with a key)");
  }

  async unshare(m) {
    const share = this.shares[m];
    delete this.shares[m];
    this.remembered(list => list.filter(x => x !== m));
    if (!share?.pid) return;
    await exec("adb", ["disconnect", `127.0.0.1:${share.port}`], { on: m, timeout: 5000 }).catch(() => {});
    await exec("taskkill", ["/PID", String(share.pid), "/F"]).catch(() => {});
  }

  async unshareAll() {
    for (const m of Object.keys(this.shares)) await this.unshare(m);
    this.declined.clear();
  }

  async helperExe() {
    // harns-dock, built from dock.cs with Windows' own C# compiler, once per version of it.
    const source = `${appHome()}\\mods\\harness-simulator\\dock.cs`;
    const text = await readTextFile(source);
    if (!text) throw new Error("dock.cs is missing from the mod");
    const exe = `${this.cache}\\harns-dock-${hash(text)}.exe`;
    const have = await fs.exists(exe).catch(() => false);
    if (have) return exe;
    const csc = `${this.windir}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`;
    const r = await exec(csc, ["-nologo", "-optimize", `-out:${exe}`, source], { timeout: 60000 });
    if (r.code !== 0) throw new Error((r.stdout + r.stderr).trim().split("\n")[0] || "Couldn't build harns-dock");
    return exe;
  }

  async dock() {
    // Hand the device window to a fresh harns-dock (one at a time).
    if (!this.device) return;
    try {
      const exe = await this.helperExe();
      this.written = null;
      this.place();
      await ps(`Get-Process -Name 'harns-dock-*' -ErrorAction SilentlyContinue | Stop-Process -Force; ` +
        `Start-Process -WindowStyle Hidden -FilePath ${quote(exe)} -ArgumentList ${quote(`run "Android Emulator - ${this.device.avd}:" "${this.stateFile}"`)}`);
      this.helper = true;
      this.status = "";
      // Builds from older versions of dock.cs (the running one can't be deleted, and stays).
      for (const name of await fs.readdir(this.cache).catch(() => []))
        if (/^harns-dock-.*\.exe$/.test(name) && !exe.endsWith(name)) fs.unlink(`${this.cache}\\${name}`).catch(() => {});
    } catch (err) {
      this.status = `Couldn't put the emulator in the panel: ${String(err?.message ?? err).split("\n")[0]}`;
    }
  }

  async undock() {
    // Back to the emulator's own window; harns-dock gives it back and exits.
    await this.write("quit");
    this.helper = false;
  }

  async write(text) {
    if (text === this.written || !this.stateFile) return;
    this.written = text;
    await fs.writeFile(this.stateFile, text).catch(() => { this.written = null; });
  }

  shown() {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    return Boolean(panel && !panel.hidden && body?.active === BLOCK);
  }

  geometry() {
    // Where the device goes: centered in the screen area at its own aspect ratio, as gaps from
    // the window's right and bottom edges plus a size, in real logical px.
    const d = this.device, a = this.area;
    if (!d?.width || !a?.width || !a?.height) return null;
    const z = zoom();
    const edge = insets(layout(), BLOCK);
    if (!edge) return null;
    const scale = Math.min(a.width / d.width, a.height / d.height);
    const w = Math.floor(d.width * scale), h = Math.floor(d.height * scale);
    return {
      right: (edge.right + BORDER + PAD) * z + (a.width - w) / 2,
      bottom: (edge.bottom + BORDER + PAD) * z + (a.height - h) / 2,
      w, h,
    };
  }

  place(show) {
    // The state harns-dock reads; written only when it changes.
    if (!this.helper || this.mode !== "dock") return;
    const g = this.geometry();
    const visible = (show ?? this.shown()) && Boolean(g);
    const text = g ? `${g.right.toFixed(1)} ${g.bottom.toFixed(1)} ${g.w} ${g.h} ${visible ? 1 : 0}` : "0 0 0 0 0";
    this.write(text);
  }

  async start(avd, cx) {
    this.busy = "starting"; this.status = `Starting ${this.label(avd)}…`; cx.notify();
    // Hidden: emulator.exe's own console. The device window shows, and harns-dock takes it
    // as soon as it appears, so it boots inside the panel.
    const started = await ps(`Start-Process -WindowStyle Hidden -FilePath ${quote(this.emulator)} -ArgumentList '-avd',${quote(avd)},'-no-boot-anim'`)
      .then(() => true, err => { this.status = `Couldn't start ${this.label(avd)}: ${err}`; return false; });
    if (started) {
      const size = await this.avdInfo(avd);
      this.device = { serial: null, avd, width: size.width, height: size.height };
      if (this.mode === "dock") await this.dock();
      cx.notify();
      for (let i = 0; i < 120 && !this.device?.serial; i++) { await cx.sleep(1500); await this.refresh(); cx.notify(); }
    }
    this.busy = null;
    if (!this.device?.serial) {
      this.device = null; this.helper = false;
      if (started) this.status = `${this.label(avd)} didn't start. Check it in Android Studio's Device Manager.`;
    } else this.status = "";
    cx.notify();
  }

  async stop(cx) {
    if (!this.device) return;
    this.busy = "stopping"; this.status = `Stopping ${this.label(this.device.avd)}…`; cx.notify();
    await this.write("0 0 0 0 0");
    await this.unshareAll();
    // `emu kill` can hang on after the emulator is gone: watch the device list instead.
    exec(this.adb, ["-s", this.device.serial, "emu", "kill"], { timeout: 15000 }).catch(() => {});
    for (let i = 0; i < 40 && this.device; i++) { await cx.sleep(500); await this.refresh(); cx.notify(); }
    this.busy = null; this.helper = false; this.status = ""; cx.notify();
  }

  async setMode(mode, cx) {
    this.mode = mode;
    try { localStorage.setItem("mode", mode); } catch {}
    if (mode === "window") await this.undock(); else await this.dock();
    cx.notify();
  }

  render() {
    const t = theme();
    const d = this.device;
    const swallow = (_e, cx) => cx.stop_propagation();
    const button = (id, icon, label, action, opts = {}) => h_flex().id(id).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).text_color(opts.primary ? t.accent_foreground : t.muted).when(Boolean(opts.primary), el => el.bg(t.accent))
      .when(!opts.disabled, el => el.cursor_pointer().hover(s => s.bg(opts.primary ? t.accent : t.hover).text_color(opts.primary ? t.accent_foreground : t.foreground))
        .on_mouse_down("left", swallow)
        // The actions await programs: they run as a task, with a context of their own (an
        // event's cx isn't usable after an await).
        .on_click((_e, cx) => { cx.spawn(async acx => { await action(acx); acx.notify(); }); }))
      .when(Boolean(opts.disabled), el => el.opacity(0.5))
      .child(svg(`mods/harness-simulator/${icon}.svg`).size(13)).when(Boolean(label), el => el.child(label));

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("sim-title").font_semibold().child("Simulator").when(Boolean(d), el => el.tooltip(this.label(d.avd))))
      .child(div().flex_1())
      .children(Object.entries(this.shares).filter(([, s]) => !s.pending).map(([m, s]) => h_flex().id(`sim-share-${m}`).h(22).px(6).gap(4)
        .flex_none().items_center().rounded(5).border_1().border_color(t.border).text_size(11).text_color(s.error ? t.blocked : t.muted)
        .tooltip(s.error ? `Not shared with ${m}: ${s.error}` : `Shared with ${m}: adb -s 127.0.0.1:${s.port} there`)
        .child(svg("mods/harness-simulator/share.svg").size(11)).child(m)
        .child(div().id(`sim-unshare-${m}`).cursor_pointer().text_color(t.dim).hover(st => st.text_color(t.foreground))
          .on_mouse_down("left", swallow)
          .on_click((_e, cx) => { this.declined.add(m); cx.spawn(async acx => { await this.unshare(m); acx.notify(); }); })
          .child(svg("mods/harness-simulator/x.svg").size(10)))))
      .when(Boolean(d), el => el
        .child(this.mode === "dock"
          ? button("sim-pop", "pop-out", null, cx => this.setMode("window", cx)).tooltip("Open in its own window")
          : button("sim-dock", "dock", null, cx => this.setMode("dock", cx)).tooltip("Show in the panel"))
        .child(button("sim-stop", "stop", null, cx => this.stop(cx), { disabled: Boolean(this.busy) }).tooltip("Stop the emulator")));

    const sizeArea = (size, cx) => {
      if (this.area && Math.abs(size.width - this.area.width) < 0.5 && Math.abs(size.height - this.area.height) < 0.5) return;
      this.area = size; this.place(); cx.notify();
    };
    let body;
    if (d && this.mode === "dock") {
      // The device window covers this; it shows only while the window is placed.
      const g = this.geometry();
      body = div().id("sim-area").size_full().flex().items_center().justify_center().on_size_change(sizeArea)
        .when(!this.helper && Boolean(this.status), el => el.child(div().max_w(260).text_size(12.5).text_color(t.muted).text_center().child(this.status)))
        .when(this.helper && Boolean(g), el => el.child(div().w(g.w / zoom()).h(g.h / zoom()).rounded(8).bg(t.surface)));
    } else if (d) {
      body = div().id("sim-area").size_full().on_size_change(sizeArea).child(v_flex().size_full().items_center().justify_center().gap(10)
        .child(div().text_size(12.5).text_color(t.muted).child(`${this.label(d.avd)} is in its own window.`))
        .child(button("sim-dock-big", "dock", "Show in the panel", cx => this.setMode("dock", cx), { primary: true })));
    } else {
      body = div().id("sim-area").size_full().on_size_change(sizeArea).child(v_flex().size_full().items_center().justify_center().gap(10).px(10)
        .when(Boolean(this.status), el => el.child(div().max_w(260).text_size(12.5).text_color(t.muted).text_center().child(this.status)))
        .children(this.busy ? [] : this.avds.map(avd => button(`sim-start-${avd}`, "play", `Start ${this.label(avd)}`, cx => this.start(avd, cx), { primary: true }))));
    }

    // A card, as Files and Changes draw theirs.
    return v_flex().id("root").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(header)
      .child(div().flex_1().min_h(0).p(PAD).child(body));
  }
}
