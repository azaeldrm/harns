import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKDROP = join(REPO, "layouts/harns/mods/agent-chat/backdrop");
const { SCENES } = await import(pathToFileURL(join(BACKDROP, "scenes/index.js")));
const { Palette } = await import(pathToFileURL(join(BACKDROP, "palette.js")));
const { frameRuns } = await import(pathToFileURL(join(BACKDROP, "runs.js")));

const WIDTH = 468, HEIGHT = 272, CELL = 13, SECONDS = 5, FPS = 30;
const DIM = 0.7;

/** The theme's palette, but each colour is the tint itself with the opacity as alpha (#rrggbbaa). */
class TintPalette extends Palette {
  mix(r, g, b, a = 1) {
    const byte = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return `#${byte(r)}${byte(g)}${byte(b)}${byte(Math.round(Math.max(0, Math.min(1, a)) * 31) * 255 / 31)}`;
  }
}

const SEEDS = { sharks: 111 };

let seed = 7;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const previews = {};
for (const s of SCENES) {
  seed = SEEDS[s.id] ?? 7;
  const scene = s.make();
  scene.resize(WIDTH, HEIGHT, CELL * 0.6, Math.round(CELL * 1.3));
  scene.setDim(DIM);
  const pal = new TintPalette({ background: "#000000", foreground: "#dededb", accent: "#e9aa35", done: "#10a7a7" });
  for (let i = 0; i < SECONDS * FPS; i++) scene.frame(1 / FPS, pal);
  const { cols, rows } = scene.grid;
  previews[s.id] = { cols, rows, runs: frameRuns(scene.grid).map(row => row.map(u => [u.col, u.text, u.fg ?? null, u.bg ?? null])) };
}

const out = join(REPO, "src/harns-settings/scene-previews.js");
const body = `export const SCENE_PREVIEWS = ${JSON.stringify(previews)};\r\n`;
writeFileSync(out, body);
console.log(`Wrote ${out}: ${Object.keys(previews).join(", ")} (${Math.round(body.length / 1024)} KB)`);
