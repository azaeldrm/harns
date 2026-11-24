import { readFileSync } from 'fs';
import { family, monochrome, alertColors, rangeColor, rangeCalm, brightest, seriesColor, backdropAccents, brandIcons } from '../layouts/harns/mods/machine-sidebar/tones.js';
import { COLOR_THEMES } from '../layouts/harns/mods/harns-chrome/harns-colors.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const theme = name => JSON.parse(readFileSync(new URL(`../layouts/harns/themes/${name}.json`, import.meta.url), 'utf8')).colors;
const harns = theme('harness-color'), mono = theme('harness'), lively = theme('harness-lively');
const gray = c => { const n = parseInt(c.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b) <= 12; };

check('each colour choice has its theme file', Object.values(COLOR_THEMES).map(n => Boolean(theme(n).accent)), [true, true, true]);
check('the logo theme is the harns family', family(harns), 'harns');
check('the gray theme is monochrome', [family(mono), monochrome(mono)], ['mono', true]);
check('the Lively theme is Lively', family(lively), 'lively');
check('a herdr theme counts as Lively, so mods outside harns keep their colours', family({ accent: '#a7b4c6' }), 'lively');

check('Monochrome is gray but for needing you (red) and done (green)', Object.entries(mono).filter(([, c]) => !gray(c)).map(([k]) => k), ['blocked', 'done']);
check('Monochrome needing you is red and done is green', [mono.blocked, mono.done], ['#d88179', '#6cc48a']);
check('Monochrome warnings and calm bars, chart series and backdrop are grays',
  [alertColors(mono).warn, alertColors(mono).healthy, ...[0, 1, 2, 3].map(i => seriesColor(mono, '#d97757', i)), ...backdropAccents(mono)].every(gray), true);
check('a Monochrome bar is still gray at three quarters', gray(rangeColor(mono, 0.75)), true);
check('a Monochrome bar is gray up to 85%, then turns red', [0.5, 0.75, 0.85].map(s => gray(rangeColor(mono, s))).concat(gray(rangeColor(mono, 0.9))), [true, true, true, false]);
check("Monochrome's calm end is its whitest white", rangeColor(mono, 0.85), mono.working);
check('only Monochrome holds its alarm back', [rangeCalm(mono), rangeCalm(harns), rangeCalm(lively)], [0.85, 1, 1]);
check("the brightest mark is Monochrome's whitest, else the accent", [brightest(mono), brightest(harns), brightest(lively)], [mono.working, harns.accent, lively.accent]);

check('harns runs teal to orange', [rangeColor(harns, 0), rangeColor(harns, 1)], ['#5ccfcb', '#ffa422']);
check('Lively runs green to red', [rangeColor(lively, 0), rangeColor(lively, 1)], ['#6cc48a', '#d88179']);
check('Monochrome runs gray, turning red at the end', [rangeColor(mono, 0), rangeColor(mono, 1)], ['#9a9fa2', '#d88179']);
check('the range blends between stops', rangeColor(lively, 1 / 6), '#abb760');
check('out-of-range shares are clamped', [rangeColor(harns, -1), rangeColor(harns, 7)], ['#5ccfcb', '#ffa422']);

check('Lively keeps each agent\'s own chart colour', seriesColor(lively, '#d97757', 0), '#d97757');
check('harns charts use the logo\'s panels', seriesColor(harns, '#d97757', 0), '#05b9c5');
const claude = { agent: true }, shell = { agent: false };
check('only Lively shows agent icons in their own colours', [brandIcons(harns, claude), brandIcons(mono, claude), brandIcons(lively, claude)], [false, false, true]);
check('shells and other programs stay tinted even in Lively', [brandIcons(lively, shell), brandIcons(lively, undefined)], [false, false]);
check('done is the theme\'s own', [alertColors(harns).done, alertColors(lively).done], [harns.done, lively.done]);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
