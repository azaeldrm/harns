import { toastTone } from '../layouts/harns/mods/harns-toast/tone.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const go = terminal => ({ name: 'agent.focus', args: { terminal } });

check('a finished agent is done', toastTone({ title: 'Claude Code finished', body: 'home / Claude Code', level: 'info' }), 'done');
check('an agent needing you is blocked', toastTone({ title: 'Claude Code needs you', level: 'info' }), 'blocked');
check('an agent asking is blocked', toastTone({ title: 'Pi is asking' }), 'blocked');
check('otherwise the agent it goes to decides', toastTone({ title: 'Murmur', action: go('h/t8d') }, [{ address: 'h/t8d', status: 'blocked' }]), 'blocked');
check('an agent at work leaves it to the level', toastTone({ title: 'Murmur', action: go('h/t8d'), level: 'info' }, [{ address: 'h/t8d', status: 'working' }]), null);
check('an error is red, a success green', [toastTone({ title: 'Copy failed', level: 'error' }), toastTone({ title: 'Saved', level: 'success' })], ['blocked', 'done']);
check('anything else keeps the theme', toastTone({ title: 'Update ready', level: 'info' }), null);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
