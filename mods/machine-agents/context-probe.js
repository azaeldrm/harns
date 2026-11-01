export const contextProbe = String.raw`"""Session context relay. Stores identifiers and counters, never conversation text."""
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

def codex_usage(snapshot):
    sid = snapshot.get('sessionId', '')
    if not re.fullmatch(r'[0-9a-fA-F-]{36}', sid):
        return None
    home = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex')))
    for path in (home / 'sessions').rglob('*' + sid + '.jsonl'):
        with path.open('rb') as f:
            f.seek(max(0, path.stat().st_size - 2097152))
            lines = f.read().decode('utf-8', errors='replace').splitlines()
        for line in reversed(lines):
            try:
                event = json.loads(line)
                payload = event.get('payload', {})
                if event.get('type') != 'event_msg' or payload.get('type') != 'token_count':
                    continue
                info = payload.get('info') or {}
                limit = info.get('model_context_window')
                used = (info.get('last_token_usage') or {}).get('total_tokens')
                if isinstance(limit, (int, float)) and limit > 0 and isinstance(used, (int, float)):
                    return dict(snapshot, tokens=used, contextWindow=limit, percent=max(0, min(100, used / limit * 100)))
            except (ValueError, TypeError):
                pass
    return None

def collect():
    result = {}
    for path in ROOT.glob('*.json'):
        try:
            value = json.loads(path.read_text(encoding='utf-8-sig'))
            if value.get('tool') == 'codex':
                value = codex_usage(value)
            if value and isinstance(value.get('percent'), (int, float)):
                result[value['address']] = value
        except (OSError, ValueError, KeyError, TypeError):
            pass
    return result

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'claude':
        try:
            data = json.load(sys.stdin)
            context = data.get('context_window') or {}
            current = context.get('current_usage') or {}
            tokens = sum(current.get(k, 0) or 0 for k in ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'])
            save('claude', dict(sessionId=data.get('session_id'), percent=context.get('used_percentage'),
                 contextWindow=context.get('context_window_size'), tokens=tokens if current else None))
            limits = data.get('rate_limits')
            if limits:
                target = Path.home() / '.claude' / 'herdr-usage.json'
                temp = target.with_suffix('.tmp')
                temp.write_text(json.dumps(dict(updatedAt=time.time(), fiveHour=limits.get('five_hour'), sevenDay=limits.get('seven_day'))), encoding='utf-8')
                temp.replace(target)
            original = ROOT.parent / 'claude-statusline-original.json'
            if original.exists():
                import subprocess
                command = json.loads(original.read_text(encoding='utf-8')).get('command')
                if command:
                    subprocess.run(command, shell=True, input=json.dumps(data), text=True, check=False)
        except (ValueError, OSError):
            pass
    elif len(sys.argv) > 1 and sys.argv[1] == 'notify':
        try:
            data = json.loads(sys.argv[-1])
            sid = data.get('thread-id') or data.get('thread_id')
            if sid:
                save('codex', {'sessionId': sid})
        except (ValueError, OSError):
            pass
    else:
        print(json.dumps(collect()))
`;
