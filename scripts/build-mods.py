import json
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
metrics = (repo / 'mods/machine-metrics/main.js').read_text(encoding='utf-8')
(repo / 'mods/machine-agents/machine-metrics.js').write_text(metrics, encoding='utf-8')
for name in ('turns.js', 'details.js', 'platforms.js', 'probes.js', 'gpus.js'):
    # The agents list reads a machine's details itself, for its hover card (details.js and what it runs on).
    (repo / 'mods/machine-agents' / name).write_text((repo / 'mods/machine-stats' / name).read_text(encoding='utf-8'), encoding='utf-8')
probe = (repo / 'scripts/context-relay.py').read_text(encoding='utf-8')
(repo / 'mods/machine-agents/context-probe.js').write_text('export const contextProbe = ' + json.dumps(probe) + ';\n', encoding='utf-8')
target = repo / 'mods/machine-agents/context-rings'
target.mkdir(parents=True, exist_ok=True)
# The working spinner, and the empty ring an idle agent shows open (on the rail it shows a small context bar).
head = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">'
track = '<circle cx="12" cy="12" r="9.4" stroke-opacity="0.24"/>'
(target / 'idle.svg').write_text(head + track + '</svg>\n', encoding='utf-8')
# The spinner has a clear margin (a 30-unit square around the 24): herdr turns it as a picture, and a turned square's corners
# reach past it, where they'd pick up whatever icon lies next to it.
padded = head.replace('width="24" height="24" viewBox="0 0 24 24"', 'width="30" height="30" viewBox="-3 -3 30 30"')
(target / 'spinner.svg').write_text(padded + track + '<path d="M12 2.6a9.4 9.4 0 0 1 9.4 9.4"/></svg>\n', encoding='utf-8')

for source, target in [('main.js', 'machine-data.js'), ('probes.js', 'probes.js'),
                       ('platforms.js', 'platforms.js'), ('gpus.js', 'gpus.js'), ('usage.js', 'usage.js'),
                       ('turns.js', 'turns.js')]:
    (repo / 'mods/workspace-status-machine' / target).write_text(
        (repo / 'mods/machine-stats' / source).read_text(encoding='utf-8'), encoding='utf-8')
