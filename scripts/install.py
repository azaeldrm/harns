import json, os, re, shutil, subprocess, sys, time
from pathlib import Path

MODS = ['harness-chrome', 'harness-pane', 'harness-tabs', 'machine-agents', 'machine-metrics',
        'machine-new-menu', 'machine-stats', 'workspace-status-machine']
LAYOUT = 'herdr-harness'


def fail(message):
    print(f'error: {message}', file=sys.stderr)
    sys.exit(1)


def find_app():
    app = shutil.which('herdr-app')
    if not app and os.name == 'nt' and os.environ.get('LOCALAPPDATA'):
        candidate = Path(os.environ['LOCALAPPDATA']) / 'Programs' / 'herdr-app' / 'herdr-app.exe'
        if candidate.exists():
            app = str(candidate)
    if not app:
        fail('herdr-app was not found. Install the Herdr app first.')
    return app


def herdr_home():
    configured = os.environ.get('HERDR_APP_HOME')
    return Path(configured) if configured else Path.home() / '.config' / 'herdr-app'


def same_folder(repo, home):
    try:
        return home.exists() and os.path.samefile(repo, home)
    except OSError:
        return False


def copy_tree(source, target):
    target.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target, dirs_exist_ok=True)


def merge_programs(ours_path, theirs_path):
    ours = json.loads(ours_path.read_text(encoding='utf-8-sig'))
    if not theirs_path.exists():
        shutil.copy2(ours_path, theirs_path)
        return
    theirs = json.loads(theirs_path.read_text(encoding='utf-8-sig'))
    programs = theirs.get('programs')
    if not isinstance(programs, dict):
        programs = theirs['programs'] = {}
    for name, fields in ours.get('programs', {}).items():
        entry = programs.get(name)
        if not isinstance(entry, dict):
            entry = programs[name] = {}
        entry.update(fields)
    temp = theirs_path.with_suffix('.json.tmp')
    temp.write_text(json.dumps(theirs, indent=2) + '\n', encoding='utf-8')
    temp.replace(theirs_path)


def main():
    switch = '--no-switch' not in sys.argv[1:] and '-NoSwitch' not in sys.argv[1:]
    relays = '--no-relays' not in sys.argv[1:] and '-NoRelays' not in sys.argv[1:]
    repo = Path(__file__).resolve().parent.parent
    home = herdr_home()
    app = find_app()

    if subprocess.run([sys.executable, str(repo / 'scripts' / 'build-mods.py')]).returncode != 0:
        fail('Generating the built mod files failed (scripts/build-mods.py).')

    if not same_folder(repo, home):
        stamp = time.strftime('%Y%m%d-%H%M%S')
        for mod in MODS:
            copy_tree(repo / 'mods' / mod, home / 'mods' / mod)
        (home / 'themes').mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / 'themes' / 'harness.json', home / 'themes' / 'harness.json')
        copy_tree(repo / 'brand-assets', home / 'brand-assets')

        layouts = home / 'layouts'
        layouts.mkdir(parents=True, exist_ok=True)
        layout_target = layouts / f'{LAYOUT}.json'
        if layout_target.exists():
            shutil.copy2(layout_target, layouts / f'{LAYOUT}.json.before-install-{stamp}')
        shutil.copy2(repo / 'layouts' / f'{LAYOUT}.png', layouts / f'{LAYOUT}.png')
        shutil.copy2(repo / 'layouts' / f'{LAYOUT}.json', layout_target)

        merge_programs(repo / 'programs.json', home / 'programs.json')

    for mod in MODS:
        result = subprocess.run([app, 'check', str(home / 'mods' / mod)], capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stdout + result.stderr, file=sys.stderr)
            fail(f'herdr-app check failed for mods/{mod}')
    print(f'Checked {len(MODS)} mods in {home / "mods"}')

    if relays and subprocess.run([sys.executable, str(repo / 'scripts' / 'install-context.py')]).returncode != 0:
        fail('Installing the relays failed (scripts/install-context.py). --no-relays skips them.')

    layout = (repo / 'layouts' / f'{LAYOUT}.json').read_text(encoding='utf-8')
    needed = sorted(set(re.findall(r'"mod":\s*"([^"]+)"', layout)))
    missing = [mod for mod in needed if not (home / 'mods' / mod).is_dir()]
    if missing:
        print('warning: the layout also uses mods that are not installed: ' + ', '.join(missing) +
              '. herdr-chat comes from https://github.com/azaeldrm/herdr-chat; install it, then run '
              'this again. Not switching, or the layout would show errors in their place.', file=sys.stderr)

    if switch and not missing:
        if subprocess.run([app, 'do', 'layout.switch', '--name', LAYOUT], stdout=subprocess.DEVNULL).returncode != 0:
            fail(f'Switching to the {LAYOUT} layout failed.')
        print(f'Switched to {LAYOUT}. ctrl-shift-l switches back.')

    status = subprocess.run([app, 'status'], capture_output=True, text=True)
    print(status.stdout.strip() or status.stderr.strip())


if __name__ == '__main__':
    main()
