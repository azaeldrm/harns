import { sessionTitle } from '../layouts/harns/mods/harns-tabs/session-title.js';
import { folderName } from '../layouts/harns/mods/harns-tabs/paths.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const claude = { name: 'Claude Code', key: 'claude', agent: true };
const codex = { name: 'Codex', key: 'codex', agent: true };

check('the conversation from a Claude Code title, its spinner and name taken off',
  sessionTitle({ program: claude, title: '\u2733 Claude Code - fix the login bug', cwd: '/srv/app' }), 'fix the login bug');
check('a title opening with a bracket or quote keeps it, after the spinner',
  ['✳ (Skill) Visual Revamp', '⠂ [WIP] the importer', '"Quoted" plan', '✳ “Smart” quotes'].map(title => sessionTitle({ program: claude, title, cwd: '/srv/app' })).join(' | '),
  '(Skill) Visual Revamp | [WIP] the importer | "Quoted" plan | “Smart” quotes');
check('a title that is only the agent name says nothing', sessionTitle({ program: claude, title: 'Claude Code', cwd: '/srv/app' }), '');
check('a path says nothing', sessionTitle({ program: claude, title: '~/code/app', cwd: '/srv/app' }), '');
check('a prompt says nothing', sessionTitle({ program: claude, title: 'azael@homelab: ~', cwd: '/srv/app' }), '');
check('the folder after the conversation is taken off', sessionTitle({ program: claude, title: 'review the PR - app', cwd: '/srv/app' }), 'review the PR');
check('the part after the bar in a Codex title is taken off', sessionTitle({ program: codex, title: 'plan the release | gpt', cwd: '/srv/app' }), 'plan the release');
check('no pane, no title', sessionTitle(undefined), '');
check('a Windows folder name', folderName('C:\\Users\\Azael\\harns\\'), 'harns');
check('a Unix folder name', folderName('/srv/code/murmur'), 'murmur');

if (failed) { console.log(`${failed} failed`); process.exit(1); }
