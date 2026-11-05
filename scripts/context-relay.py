"""Session context relay. Stores identifiers and counters, never conversation text."""
import json, os, re, sys, time
from pathlib import Path

ROOT = Path.home() / '.config' / 'harness' / 'context'

def save(tool, payload):
    address = os.environ.get('HC_TERMINAL_ID', '').split('/')[-1]
    if not re.fullmatch(r't[0-9a-z]+', address):
        return
    ROOT.mkdir(parents=True, exist_ok=True)
    target = ROOT / (address + '.' + tool + '.json')
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(dict(payload, address=address, tool=tool, updatedAt=time.time())), encoding='utf-8')
    temp.replace(target)

def collect():
    """Every terminal's latest context snapshot, by its address."""
    result = {}
    for path in ROOT.glob('*.json'):
        try:
            value = json.loads(path.read_text(encoding='utf-8-sig'))
            if isinstance(value.get('percent'), (int, float)):
                held = result.get(value['address'])
                if not held or value.get('updatedAt', 0) > held.get('updatedAt', 0):
                    result[value['address']] = value
        except (OSError, ValueError, KeyError, TypeError):
            pass
    return result

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'claude':
        try:
            data = json.load(sys.stdin)
            context = data.get('context_window') or {}
            save('claude', dict(sessionId=data.get('session_id'), percent=context.get('used_percentage')))
            original = ROOT.parent / 'claude-statusline-original.json'
            if original.exists():
                import subprocess
                command = json.loads(original.read_text(encoding='utf-8')).get('command')
                if command:
                    subprocess.run(command, shell=True, input=json.dumps(data), text=True, check=False)
        except (ValueError, OSError):
            pass
    else:
        print(json.dumps(collect()))
