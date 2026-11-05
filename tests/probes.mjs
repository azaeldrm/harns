import { linuxProbe, pythonAccountProbe } from '../mods/machine-stats/probes.js';
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`); if (!ok) failed++; };
const run = (script, home, bin) => JSON.parse(execFileSync('python3', ['-c', script], {
  env: { HOME: home, PATH: [bin, '/usr/bin', '/bin'].filter(Boolean).join(':'), SHELL: '/bin/false' } }).toString());

const bin = mkdtempSync(join(tmpdir(), 'harness-codex-'));
writeFileSync(join(bin, 'codex'), `#!/usr/bin/env python3
import json, sys
for line in iter(sys.stdin.readline, ''):
    m = json.loads(line)
    if m.get('method') == 'initialize':
        print(json.dumps({'id': m['id'], 'result': {}}), flush=True)
    elif m.get('method') == 'account/rateLimits/read':
        print(json.dumps({'method': 'some/notification', 'params': {}}), flush=True)
        print(json.dumps({'id': m['id'], 'result': {'rateLimits': {
            'primary': {'usedPercent': 10, 'windowDurationMins': 300, 'resetsAt': 100},
            'secondary': {'usedPercent': 3, 'windowDurationMins': 10080, 'resetsAt': 900}}}}), flush=True)
`);
chmodSync(join(bin, 'codex'), 0o755);
const home = mkdtempSync(join(tmpdir(), 'harness-probe-'));

const out = run(pythonAccountProbe(['Claude', 'Codex']), home, bin);
check('Codex: the account limits app-server reports, by window length',
  JSON.stringify(out.Codex) === JSON.stringify({ fiveHour: { used: 10, resetsAt: 100 }, sevenDay: { used: 3, resetsAt: 900 } }), JSON.stringify(out.Codex));
check('Claude with no login here: signed out, and no request made', out.Claude?.error === 'Signed out', JSON.stringify(out.Claude));

const none = run(pythonAccountProbe(['Codex']), home, null);
check('no codex anywhere: not installed', JSON.stringify(none) === JSON.stringify({ Codex: { error: 'Not installed' } }), JSON.stringify(none));
const one = run(pythonAccountProbe(['Codex']), home, bin);
check('only the services asked for', Object.keys(one).join() === 'Codex', JSON.stringify(one));

const stats = run(linuxProbe([]), home, null);
check('the stats probe reads stats only', typeof stats.memory === 'number' && !('usage' in stats), JSON.stringify(stats).slice(0, 120));
process.exit(failed ? 1 : 0);
