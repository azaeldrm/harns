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
import { exec, appHome, readTextFile, layout, settings, window, theme } from "herdr";
import * as fs from "fs/promises";

const BLOCK = "simulator";
const PAD = 12;           // around the screen area, in the mod's px (herdr zooms them)
const POLL = 4000;        // how often the device list is read while the panel shows (ms)

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

const hash = text => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const quote = s => `'${String(s).replace(/'/g, "''")}'`;   // a PowerShell literal
const zoom = () => Number(settings()?.zoom) || 1;   // herdr scales the mod's px by this
const ps = script => exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);

export default class Simulator extends View {
  init(_props, cx) {
    this.area = null;            // the screen area's size, real logical px
    this.avds = [];              // virtual devices that can start
    this.device = null;          // the running emulator: { serial, avd, width, height }
    this.status = "Looking for the Android SDK…";
    this.busy = null;            // "starting" | "stopping" while that runs
    this.mode = "dock";          // "dock": in the panel; "window": a window of its own
    try { this.mode = localStorage.getItem("mode") === "window" ? "window" : "dock"; } catch {}
    this.helper = false;         // a harns-dock is running for this device
    this.written = null;         // the state file's last contents
    if (window()?.platform !== "windows") { this.status = "The Simulator panel runs on Windows for now."; return; }
    cx.spawn(async cx => {
      await this.setup();
      cx.notify();
      for (;;) {
        if (this.shown() || this.busy) { await this.refresh(); cx.notify(); }
        await cx.sleep(this.busy ? 1500 : POLL);
      }
    });
    // Whether the panel shows is read from the layout. A hidden stack child may not render, so a
    // light timer keeps the device window in step with it (no programs run here).
    cx.timer.every(200, () => this.place());
  }

  async close() {
    // The panel's slot went away (another layout, or quitting): the device window hides with it.
    this.place(false);
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
    const list = await exec(this.emulator, ["-list-avds"]).catch(() => null);
    if (!list || list.code !== 0) { this.status = "No Android emulator found. Install the Android SDK's emulator, or set ANDROID_HOME."; return; }
    this.avds = list.stdout.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("INFO"));
    this.status = this.avds.length ? "" : "No virtual devices yet. Create one in Android Studio's Device Manager, or with avdmanager.";
    await this.refresh();
  }

  async avdSize(avd) {
    // The screen size from the virtual device's config.ini, known before it boots.
    const r = await ps(`$d = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } else { Join-Path $HOME '.android\\avd' }; ` +
      `Get-Content -LiteralPath (Join-Path $d ${quote(`${avd}.avd\\config.ini`)}) -ErrorAction SilentlyContinue | Select-String '^hw\\.lcd\\.(width|height)='`).catch(() => null);
    const w = /hw\.lcd\.width=(\d+)/.exec(r?.stdout ?? ""), h = /hw\.lcd\.height=(\d+)/.exec(r?.stdout ?? "");
    return w && h ? { width: +w[1], height: +h[1] } : null;
  }

  async refresh() {
    // The running emulator, if any (the first one adb lists). Short timeouts throughout:
    // `adb shell` commands wait while Android is still booting.
    const r = await exec(this.adb, ["devices"], { timeout: 5000 }).catch(() => null);
    const serial = r?.stdout.split(/\r?\n/).map(l => l.split(/\s+/)).find(([s, state]) => /^emulator-\d+$/.test(s) && state === "device")?.[0];
    if (!serial) {
      // While one starts, adb doesn't list it yet: keep what start() set.
      if (this.device && this.busy !== "starting") { this.device = null; this.helper = false; }
      return;
    }
    if (this.device?.serial !== serial || !this.device.width) {
      const name = await exec(this.adb, ["-s", serial, "emu", "avd", "name"], { timeout: 5000 }).catch(() => null);
      const avd = name?.stdout.split(/\r?\n/)[0]?.trim() || serial;
      let size = this.device?.avd === avd && this.device.width ? this.device : await this.avdSize(avd);
      if (!size) {
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
      right: (edge.right + PAD) * z + (a.width - w) / 2,
      bottom: (edge.bottom + PAD) * z + (a.height - h) / 2,
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
    this.busy = "starting"; this.status = `Starting ${avd}…`; cx.notify();
    // Hidden: emulator.exe's own console. The device window shows, and harns-dock takes it
    // as soon as it appears, so it boots inside the panel.
    const started = await ps(`Start-Process -WindowStyle Hidden -FilePath ${quote(this.emulator)} -ArgumentList '-avd',${quote(avd)},'-no-boot-anim'`)
      .then(() => true, err => { this.status = `Couldn't start ${avd}: ${err}`; return false; });
    if (started) {
      const size = await this.avdSize(avd);
      this.device = { serial: null, avd, width: size?.width ?? 0, height: size?.height ?? 0 };
      if (this.mode === "dock") await this.dock();
      cx.notify();
      for (let i = 0; i < 120 && !this.device?.serial; i++) { await cx.sleep(1500); await this.refresh(); cx.notify(); }
    }
    this.busy = null;
    if (!this.device?.serial) {
      this.device = null; this.helper = false;
      if (started) this.status = `${avd} didn't start. Check it in Android Studio's Device Manager.`;
    } else this.status = "";
    cx.notify();
  }

  async stop(cx) {
    if (!this.device) return;
    this.busy = "stopping"; this.status = `Stopping ${this.device.avd}…`; cx.notify();
    await this.write("0 0 0 0 0");
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
      .text_size(12).text_color(opts.primary ? t.accent_foreground : t.muted).bg(opts.primary ? t.accent : t.chrome)
      .when(!opts.disabled, el => el.cursor_pointer().hover(s => s.bg(opts.primary ? t.accent : t.hover).text_color(opts.primary ? t.accent_foreground : t.foreground))
        .on_mouse_down("left", swallow)
        // The actions await programs: they run as a task, with a context of their own (an
        // event's cx isn't usable after an await).
        .on_click((_e, cx) => { cx.spawn(async acx => { await action(acx); acx.notify(); }); }))
      .when(Boolean(opts.disabled), el => el.opacity(0.5))
      .child(svg(`mods/harness-simulator/${icon}.svg`).size(13)).when(Boolean(label), el => el.child(label));

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg("mods/harness-simulator/smartphone.svg").size(14).flex_none().text_color(t.muted))
      .child(div().text_size(13).text_color(t.foreground).child("Simulator"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim)
        .child(d ? d.avd : this.busy === "starting" ? "Starting…" : ""))
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
        .when(this.helper && Boolean(g), el => el.child(div().w(g.w / zoom()).h(g.h / zoom()).rounded(8).bg(t.background)));
    } else if (d) {
      body = div().id("sim-area").size_full().on_size_change(sizeArea).child(v_flex().size_full().items_center().justify_center().gap(10)
        .child(div().text_size(12.5).text_color(t.muted).child(`${d.avd} is in its own window.`))
        .child(button("sim-dock-big", "dock", "Show in the panel", cx => this.setMode("dock", cx), { primary: true })));
    } else {
      body = div().id("sim-area").size_full().on_size_change(sizeArea).child(v_flex().size_full().items_center().justify_center().gap(10).px(10)
        .when(Boolean(this.status), el => el.child(div().max_w(260).text_size(12.5).text_color(t.muted).text_center().child(this.status)))
        .children(this.busy ? [] : this.avds.map(avd => button(`sim-start-${avd}`, "play", `Start ${avd}`, cx => this.start(avd, cx), { primary: true }))));
    }

    return v_flex().id("root").size_full().bg(t.surface)
      .child(header)
      .child(div().flex_1().min_h(0).p(PAD).child(body));
  }
}
