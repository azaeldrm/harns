"""Builds trailhead, the demo project harns's screenshots use, as a git checkout on this computer or another machine.

The project's files live in demo/: trailhead/ is main, branches/ holds what each branch changes, wip/ an uncommitted
change. The checkout gets three commits on main, one on each branch, the chosen branch checked out, and on
feat/elevation-chart a README edit left uncommitted, so the sidebar, the status bar and Changes have something to show.

    python scripts/demo.py                                  # ~/.cache/harns-demo/trailhead here, on main
    python scripts/demo.py --on homelab --branch fix/gpx-import

It only replaces a folder it made itself (marked inside .git), and needs git and Python 3 on the machine.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent / "demo"

COMMITS = [
    ("Start trailhead: README and trail data", ["README.md", "data/trails.json", ".gitignore"]),
    ("API: serve trails and read GPX tracks", ["api/app.py", "api/gpx.py", "api/test_gpx.py"]),
    ("Web: list the trails, longest first", ["web/index.html", "web/main.js"]),
]

BRANCHES = [
    ("feat/elevation-chart", "Web: an elevation chart for each trail", "elevation-chart"),
    ("fix/gpx-import", "GPX: skip points without an elevation", "gpx-import"),
]

WIP = {"feat/elevation-chart": "elevation-chart"}

BUILDER = r'''
import json, os, shutil, subprocess, sys
spec = json.loads(SPEC)
dest = os.path.expanduser(spec["dest"])
marker = os.path.join(dest, ".git", "harns-demo")
if os.path.exists(dest):
    if not os.path.exists(marker):
        sys.exit(f"{dest} exists and wasn't made by scripts/demo.py; not touching it")
    shutil.rmtree(dest, onerror=lambda func, path, _: (os.chmod(path, 0o700), func(path)))
os.makedirs(dest)
env = dict(os.environ, GIT_AUTHOR_NAME="trailhead", GIT_AUTHOR_EMAIL="trailhead@example.com",
           GIT_COMMITTER_NAME="trailhead", GIT_COMMITTER_EMAIL="trailhead@example.com")
def git(*args, day=None):
    if day: env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = f"2026-11-{day:02d}T10:00:00+00:00"
    subprocess.run(["git", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", *args], cwd=dest, env=env, check=True, capture_output=True)
def write(files):
    for path, text in files.items():
        full = os.path.join(dest, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8", newline="\n") as f: f.write(text)
git("init")
open(marker, "w").close()
day = 1
for message, files in spec["commits"]:
    write(files); git("add", "-A"); git("commit", "-m", message, day=day); day += 1
for name, message, files in spec["branches"]:
    git("checkout", "-b", name, "main"); write(files); git("add", "-A"); git("commit", "-m", message, day=day); day += 1
git("checkout", spec["checkout"])
write(spec["wip"].get(spec["checkout"], {}))
print(f"trailhead at {dest} on {spec['checkout']}")
'''


def read(folder, paths=None):
    """The files under `folder` (only `paths`, when given) as {posix path: text}."""
    base = DEMO / folder
    found = paths or [p.relative_to(base).as_posix() for p in sorted(base.rglob("*")) if p.is_file()]
    return {path: (base / path).read_text(encoding="utf-8") for path in found}


def program(dest, checkout):
    """The Python program that builds the checkout at `dest` with `checkout` checked out, its files inside it."""
    spec = {
        "dest": dest,
        "checkout": checkout,
        "commits": [(message, read("trailhead", paths)) for message, paths in COMMITS],
        "branches": [(name, message, read(f"branches/{folder}")) for name, message, folder in BRANCHES],
        "wip": {name: read(f"wip/{folder}") for name, folder in WIP.items()},
    }
    return f"SPEC = {json.dumps(json.dumps(spec))}\n{BUILDER}"


def main():
    """Builds the demo where the arguments say and reports where it went, or exits with git's or hc's error."""
    branches = ["main", *(name for name, _, _ in BRANCHES)]
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--on", help="another machine, as `hc machine ls` names it (default: this computer)")
    parser.add_argument("--branch", default="main", choices=branches, help="the branch to check out")
    parser.add_argument("--into", default="~/.cache/harns-demo/trailhead", help="where to build it (~ is that machine's home)")
    args = parser.parse_args()
    command = ["hc", "exec", "-i", "--on", args.on, "--", "python3", "-"] if args.on else [sys.executable, "-"]
    result = subprocess.run(command, input=program(args.into, args.branch), text=True, capture_output=True)
    sys.stdout.write(result.stdout)
    if result.returncode != 0:
        sys.exit(result.stderr.strip() or f"{command[0]} exited with {result.returncode}")


if __name__ == "__main__":
    main()
