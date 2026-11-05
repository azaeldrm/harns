"""Install the relays that feed the context rings, locally or through hc exec --on MACHINE:
Claude Code's status line and Pi's extension. Codex needs none: its ring reads the context its
footer shows. Takes out the Codex notify line earlier versions added. No session restarts. Runs
on Windows, Linux and macOS."""
import base64, json, os, shutil, subprocess, sys
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
relay = (repo / 'scripts/context-relay.py').read_text(encoding='utf-8')
extension = (repo / 'scripts/pi-context-relay.ts').read_text(encoding='utf-8')
install = r'''
import base64,json,os,shutil,sys
from pathlib import Path
home=Path.home()
root=home/'.config/harness'
root.mkdir(parents=True,exist_ok=True)
relay=root/'context-relay.py'
relay.write_bytes(base64.b64decode(sys.argv[1]))
extension=home/'.pi/agent/extensions/harness-context.ts'
extension.parent.mkdir(parents=True,exist_ok=True)
extension.write_bytes(base64.b64decode(sys.argv[2]))
codex=home/'.codex/config.toml'
if codex.exists():
 lines=codex.read_text(encoding='utf-8-sig').splitlines(keepends=True)
 kept=[l for l in lines if not (l.startswith('notify') and 'context-relay.py' in l)]
 if len(kept)!=len(lines): codex.write_text(''.join(kept),encoding='utf-8')
claude=home/'.claude/settings.json'
if claude.parent.exists():
 settings=json.loads(claude.read_text(encoding='utf-8-sig')) if claude.exists() else {}
 current=(settings.get('statusLine') or {}).get('command','')
 backup=claude.with_suffix('.json.before-harness-context')
 if claude.exists() and not backup.exists(): shutil.copy2(claude,backup)
 if current and 'herdr-usage-statusline' not in current and str(relay) not in current:
  (root/'claude-statusline-original.json').write_text(json.dumps(settings['statusLine']),encoding='utf-8')
 import shlex
 command=('"'+sys.executable+'" "'+str(relay)+'" claude') if os.name=='nt' else shlex.join([sys.executable,str(relay),'claude'])
 settings['statusLine']=dict(settings.get('statusLine') or {},type='command',command=command)
 claude.write_text(json.dumps(settings,indent=2),encoding='utf-8')
print('Context relays installed. Pi: /reload existing sessions.')
'''
args = [base64.b64encode(relay.encode()).decode(), base64.b64encode(extension.encode()).decode()]
if len(sys.argv) > 2 and sys.argv[1] == '--on':
    for python in ('python3', 'python'):
        if subprocess.run(['hc', 'exec', '--on', sys.argv[2], python, '-c', install, *args]).returncode == 0:
            break
    else:
        sys.exit(f'error: installing on {sys.argv[2]} failed (it needs Python 3 as python3 or python).')
else:
    subprocess.run([sys.executable, '-c', install, *args], check=True)
