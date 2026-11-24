import { chatFont, chatFonts } from '../layouts/harns/mods/harns-settings/chat-font.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

check('nothing chosen is herdr\'s font', [chatFont(undefined), chatFont(null), chatFont('  ')], [null, null, null]);
check('a chosen font is its name, trimmed', chatFont('  Segoe UI '), 'Segoe UI');
check('herdr\'s own font comes first', chatFonts('windows')[0].id, 'default');
check('the fonts herdr ships are offered everywhere', ['windows', 'macos', 'linux', 'other'].every(p => ['Geist', 'Geist Mono', 'JetBrains Mono'].every(f => chatFonts(p).some(o => o.id === f))), true);
check('Windows offers its readable fonts', chatFonts('windows').slice(4).map(f => f.id), ['Segoe UI', 'Verdana', 'Georgia']);
check('an unknown system offers only herdr\'s', chatFonts('other').length, 4);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
