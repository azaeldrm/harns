import { readFileSync, existsSync } from 'fs';
import { orbsOn, workState, WORK_STATES } from '../layouts/harns/mods/machine-sidebar/orb-states.js';
import { resolvePreset, MODE_FRAMES } from '../src/shared/vendor/thinking-orbs/engine.es.js';
import { ORB_CLIPS } from '../src/shared/orb-clips.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const theme = name => JSON.parse(readFileSync(new URL(`../layouts/harns/themes/${name}.json`, import.meta.url), 'utf8')).colors;
const dots = (state, size) => {
  const { mode, speed, opts } = resolvePreset(state, size);
  return Math.max(...[0, 0.7, 1.9, 3.3].map(t => MODE_FRAMES[mode](size, t * speed, opts).dots.length));
};

check('orbs show in Monochrome only', [orbsOn(theme('harness')), orbsOn(theme('harness-color')), orbsOn(theme('harness-lively'))], [true, false, false]);
check('an agent keeps the same orb', workState('homelab/t8d'), workState('homelab/t8d'));
check('every agent gets one from the pool', ['t1', 'homelab/t2', 'x/y/z', '', undefined].every(a => WORK_STATES.includes(workState(a))), true);
check('agents spread over the whole pool', new Set(Array.from({ length: 60 }, (_, i) => workState(`m/t${i}`))).size, WORK_STATES.length);
check('needing you and idle keep their own states', WORK_STATES.includes('listening') || WORK_STATES.includes('shaping'), false);
check('the engine draws each clip harns renders', ['working', 'searching', 'solving', 'connecting', 'weaving', 'listening', 'breathing']
  .every(s => dots(s, 20) > 0) && dots('shaping', 64) > 0, true);
const shows = {
  'agent-chat': WORK_STATES.map(s => `${s}-20`),
  'machine-sidebar': [...WORK_STATES, 'listening', 'breathing'].map(s => `${s}-20`),
  'harns-chrome': ['listening-20'],
};
const carried = (m, file) => existsSync(new URL(`../layouts/harns/mods/${m}/orbs/${file}`, import.meta.url));
check('each mod showing orbs carries the engine\'s licence', Object.keys(shows).every(m => carried(m, 'LICENSE')), true);
const sheetSize = file => {
  const b = readFileSync(new URL(`../src/shared/orbs/${file}`, import.meta.url));
  if (b.toString('ascii', 12, 16) !== 'VP8L') return null;
  const bits = b.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
};
check('each clip is one sheet per row, laid out as orb-clips.js says', Object.entries(ORB_CLIPS).filter(([clip, c]) => {
  const side = Number(clip.split('-')[1]) * 2;
  const rows = Array.from({ length: c.rows }, (_, r) => JSON.stringify(sheetSize(`${clip}/${r}.webp`)));
  return rows.some(size => size !== JSON.stringify([c.cols * side, side])) || existsSync(new URL(`../src/shared/orbs/${clip}/${c.rows}.webp`, import.meta.url))
    || c.cols * c.rows < c.frames || c.cols * (c.rows - 1) >= c.frames;
}).map(([clip]) => clip), []);
check('every clip shown has a sheet', [...new Set(Object.values(shows).flat())].filter(c => !ORB_CLIPS[c]), []);
check('each mod carries a clip of every orb it shows',
  Object.entries(shows).flatMap(([m, clips]) => clips.filter(c => !carried(m, `${c}/${ORB_CLIPS[c].rows - 1}.webp`)).map(c => `${m}/${c}`)), []);

check("Home's orb is drawn live, so agent-chat carries the engine and there's no sheet of it",
  [existsSync(new URL('../layouts/harns/mods/agent-chat/vendor/thinking-orbs/engine.es.js', import.meta.url)), existsSync(new URL('../src/shared/orbs/shaping-64', import.meta.url)), Boolean(ORB_CLIPS['shaping-64'])], [true, false, false]);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
