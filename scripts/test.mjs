// Every test, on Windows, Linux or macOS: `npm test`.
// Python 3 goes by different names: python3 on Linux and macOS; on Windows, python (when the
// installer put it on PATH) or the py launcher. Windows' python3 is often the Microsoft Store
// placeholder, which exists but doesn't run, so each name is tried, not just looked up.
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = [['python3'], ['python'], ['py', '-3']].find(([exe, ...args]) =>
  spawnSync(exe, [...args, '-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);

const steps = [
  python ? ['Python tests', python[0], [...python.slice(1), '-m', 'unittest', 'discover', '-s', 'tests']] : null,
  ...['usage', 'turns', 'probes', 'snapshots', 'markdown'].map(t => [`tests/${t}.mjs`, process.execPath, [`tests/${t}.mjs`]]),
  ['Pele matches its pin', process.execPath, ['scripts/vendor-pele.mjs', '--check']],
].filter(Boolean);

const failed = python ? [] : ['Python tests (Python 3 not found as python3, python or py -3)'];
for (const [name, exe, args] of steps) {
  console.log(`\n== ${name}`);
  if (spawnSync(exe, args, { cwd: repo, stdio: 'inherit' }).status !== 0) failed.push(name);
}
console.log(failed.length ? `\nFailed: ${failed.join(', ')}` : '\nAll tests passed.');
process.exit(failed.length ? 1 : 0);
