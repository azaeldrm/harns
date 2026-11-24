import { colorChoice, themeToApply } from '../layouts/harns/mods/harns-chrome/harns-colors.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

check('Monochrome until a choice is made', colorChoice(undefined), 'mono');
check('an unknown choice is Monochrome', colorChoice('purple'), 'mono');
check('harns colours over the monochrome theme: switch', themeToApply('harns', 'harness'), 'harness-color');
check('Monochrome over the colour theme: switch back', themeToApply('mono', 'harness-color'), 'harness');
check('already wearing the choice: nothing', themeToApply('harns', 'harness-color'), null);
check('a theme from herdr\'s menu is left alone', themeToApply('harns', 'graphite'), null);
check('a light and dark pair is left alone', themeToApply('harns', { light: 'paper', dark: 'harness' }), null);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
