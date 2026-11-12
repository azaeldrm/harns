// Exercises the Simulator fixes with herdr's APIs stubbed: specs merge and validation, and checkShares
// surviving a share that Stop removes mid-check, and repairing an offline device.
import { mkdirSync, writeFileSync, cpSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pathToFileURL, fileURLToPath } from "url";

// The mod is copied beside stub packages for gpui-kit, gpui-base and herdr, then imported.
const modDir = fileURLToPath(new URL("../mods/harness-simulator", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "harns-simulator-test-"));
const pkg = (name, src) => {
  mkdirSync(join(work, "node_modules", name), { recursive: true });
  writeFileSync(join(work, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
  writeFileSync(join(work, "node_modules", name, "index.js"), src);
};
pkg("gpui-kit", "export class View {}; export const div = () => ({}), svg = () => ({});");
pkg("gpui-base", "export const h_flex = () => ({}), v_flex = () => ({});");
pkg("herdr", `
export const appHome = () => "HOME";
export const readTextFile = async p => globalThis.files[p] ?? null;
export const exec = (...a) => globalThis.execStub(...a);
export const hc = async () => ({ stdout: "{}" });
export const layout = () => null, settings = () => ({}), window = () => ({ platform: "windows" }), theme = () => ({});
export const spaces = () => [], machines = () => [], panes = () => [], terminals = () => [], focused = () => null;`);
mkdirSync(join(work, "mod"), { recursive: true });
cpSync(modDir, join(work, "mod"), { recursive: true });
writeFileSync(join(work, "package.json"), JSON.stringify({ type: "module" }));

const { default: Sim } = await import(pathToFileURL(join(work, "mod", "main.js")).href);
const P = Sim.prototype;
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
};

// Specs: the mod's defaults under harness.json's `emulator`, per device too.
globalThis.files = {
  "HOME\\mods\\harness-simulator\\emulator.json": JSON.stringify({ default: { memory: 4096, cores: 4, gpu: "host" }, devices: { a: { gpu: "swiftshader_indirect" } } }),
  "HOME\\harness.json": JSON.stringify({ localMachineName: "pc", emulator: { default: { memory: 6144 }, devices: { a: { cores: 6 }, b: { memory: "4GB", gpu: "host gpu" } } } }),
};
const s = { specs: null };
for (const k of ["loadSpecs", "spec", "goodSpec", "badSpec", "launchArgs", "specText"]) s[k] = P[k].bind(s);
await s.loadSpecs();
check("a device gets the defaults, harness.json's defaults over them, and its own values over both", s.spec("a"), { memory: 6144, cores: 6, gpu: "swiftshader_indirect" });
check("a device not listed takes the merged defaults", s.spec("z"), { memory: 6144, cores: 4, gpu: "host" });
check("values the emulator wouldn't take are left out of its flags", s.launchArgs("b"), ["-avd", "b", "-no-boot-anim", "-cores", "4"]);
check("and named", s.badSpec("b"), ['memory "4GB"', 'gpu "host gpu"']);
check("good values are named nowhere", s.badSpec("a"), []);
globalThis.files = {};
await s.loadSpecs();
check("no settings files: no flags beyond the device, no tooltip text", [s.launchArgs("z"), s.specText("z")], [["-avd", "z", "-no-boot-anim"], ""]);

// checkShares: Stop removes a share while its machine's adb devices answers; nothing throws, nothing else is touched.
const calls = [];
const sim = { shares: { a: { machine: "m", pid: 7, port: 15555, serial: "127.0.0.1:15555" }, b: { machine: "m", error: "no key", retryAt: 0 } } };
sim.ready = () => true;
sim.unshare = async avd => { calls.push(`unshare ${avd}`); delete sim.shares[avd]; };
globalThis.execStub = async (cmd, args) => {
  calls.push(`${cmd} ${args.join(" ")}`);
  if (args[0] === "devices") { delete sim.shares.a; return { code: 0, stdout: "List of devices attached\n" }; }   // Stop, mid-check
  return { code: 0, stdout: "" };
};
let threw = null;
try { await P.checkShares.call(sim); } catch (e) { threw = String(e); }
check("a share removed mid-check doesn't throw", threw, null);
check("and nothing more is run for it", calls, ["adb devices"]);
check("a share that never got a tunnel is left for tend()'s retry, error kept", sim.shares.b, { machine: "m", error: "no key", retryAt: 0 });

// An offline device: disconnected first, then connected fresh.
calls.length = 0;
sim.shares = { a: { machine: "m", pid: 7, port: 15555, serial: "127.0.0.1:15555", error: "old" } };
globalThis.execStub = async (cmd, args) => {
  calls.push(`${cmd} ${args.join(" ")}`);
  if (args[0] === "devices") return { code: 0, stdout: "List of devices attached\n127.0.0.1:15555\toffline\n" };
  if (args[0] === "connect") return { code: 0, stdout: "connected to 127.0.0.1:15555\n" };
  return { code: 0, stdout: "" };
};
await P.checkShares.call(sim);
check("an offline device is disconnected, then connected again", calls, ["adb devices", "adb disconnect 127.0.0.1:15555", "adb connect 127.0.0.1:15555"]);
check("and its error clears", sim.shares.a.error, undefined);

rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
