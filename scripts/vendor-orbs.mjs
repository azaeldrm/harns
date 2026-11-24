import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Copies the thinking-orbs engine pinned in package.json from node_modules into src/shared/vendor/thinking-orbs: the
 * engine entry, the one chunk it imports, and the licence, unchanged, with a README naming the version. Run with
 * `npm install && npm run vendor:orbs`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "thinking-orbs");
const out = join(root, "src", "shared", "vendor", "thinking-orbs");

const pinned = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies["thinking-orbs"];
if (!existsSync(pkg)) { console.error("node_modules/thinking-orbs is missing: run npm install first"); process.exit(1); }
const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
if (version !== pinned) { console.error(`node_modules has thinking-orbs ${version}, package.json pins ${pinned}: run npm install`); process.exit(1); }

const entry = readFileSync(join(pkg, "dist", "engine.es.js"), "utf8");
const chunks = [...entry.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map(m => m[1]);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of ["engine.es.js", ...chunks]) copyFileSync(join(pkg, "dist", file), join(out, file));
copyFileSync(join(pkg, "LICENSE"), join(out, "LICENSE"));
writeFileSync(join(out, "README.txt"),
  `thinking-orbs ${version} (https://github.com/Jakubantalik/Libraries.dev/tree/main/packages/thinking-orbs), MIT: see LICENSE.\n` +
  "Copied by scripts/vendor-orbs.mjs from npm: the engine entry (engine.es.js) and the chunk it imports, unchanged.\n" +
  "Don't edit: change the pin in package.json and run npm run vendor:orbs.\n");
console.log(`Vendored thinking-orbs ${version}: ${["engine.es.js", ...chunks].join(", ")}`);
