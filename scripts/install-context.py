"""Install context relays locally or through hc exec --on MACHINE. No session restarts."""
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
 import tomllib
 text=codex.read_text(encoding='utf-8-sig')
 old=tomllib.loads(text).get('notify')
 if not old:
  backup=codex.with_suffix('.toml.before-harness-context')
  if not backup.exists(): shutil.copy2(codex,backup)
  codex.write_text('notify = '+json.dumps([sys.executable,str(relay),'notify'])+'\n'+text,encoding='utf-8')
 elif str(relay) not in old:
  print('Existing Codex notify preserved; merge context-relay.py notify into it.')
claude=home/'.claude/settings.json'
if claude.exists():
 settings=json.loads(claude.read_text(encoding='utf-8-sig'))
 current=(settings.get('statusLine') or {}).get('command','')
 backup=claude.with_suffix('.json.before-harness-context')
 if not backup.exists(): shutil.copy2(claude,backup)
 if current and 'herdr-usage-statusline' not in current and str(relay) not in current:
  (root/'claude-statusline-original.json').write_text(json.dumps(settings['statusLine']),encoding='utf-8')
 import shlex
 command=('"'+sys.executable+'" "'+str(relay)+'" claude') if os.name=='nt' else shlex.join([sys.executable,str(relay),'claude'])
 settings['statusLine']=dict(settings.get('statusLine') or {},type='command',command=command)
 claude.write_text(json.dumps(settings,indent=2),encoding='utf-8')
print('Context relays installed. Pi: /reload existing sessions. Codex: hook applies on next start.')
'''
args = [base64.b64encode(relay.encode()).decode(), base64.b64encode(extension.encode()).decode()]
if len(sys.argv) > 2 and sys.argv[1] == '--on':
    subprocess.run(['hc', 'exec', '--on', sys.argv[2], 'python3', '-c', install, *args], check=True)
else:
    subprocess.run([sys.executable, '-c', install, *args], check=True)
