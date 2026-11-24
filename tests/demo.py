"""scripts/demo.py builds trailhead as a git checkout: its branches, its uncommitted change, and only over its own folder."""
import os, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
failures = []


def check(name, ok):
    """Reports one check and remembers a failure."""
    print(("PASS " if ok else "FAIL ") + name)
    if not ok: failures.append(name)


def demo(*args):
    """Runs scripts/demo.py on this computer with `args`."""
    return subprocess.run([sys.executable, str(REPO / "scripts" / "demo.py"), *args], capture_output=True, text=True)


def git(dest, *args):
    """A git command's output in the checkout at `dest`."""
    return subprocess.run(["git", *args], cwd=dest, capture_output=True, text=True).stdout.strip()


with tempfile.TemporaryDirectory() as tmp:
    dest = os.path.join(tmp, "trailhead")
    r = demo("--into", dest, "--branch", "feat/elevation-chart")
    check("builds the checkout", r.returncode == 0 and os.path.isdir(os.path.join(dest, ".git")))
    check("main and both branches", sorted(git(dest, "branch", "--format=%(refname:short)").split()) == ["feat/elevation-chart", "fix/gpx-import", "main"])
    check("three commits on main, one on each branch", git(dest, "rev-list", "--count", "main") == "3"
          and git(dest, "rev-list", "--count", "main..fix/gpx-import") == "1")
    check("the chosen branch is checked out", git(dest, "branch", "--show-current") == "feat/elevation-chart")
    check("its README edit is left uncommitted", git(dest, "status", "--porcelain") == "M README.md")
    first = git(dest, "rev-parse", "main")
    r = demo("--into", dest)
    check("rebuilds over its own folder", r.returncode == 0 and git(dest, "branch", "--show-current") == "main" and git(dest, "status", "--porcelain") == "")
    check("commits are the same on every build", git(dest, "rev-parse", "main") == first)
    tests = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "api"], cwd=dest, capture_output=True, text=True)
    check("the demo's own tests pass", tests.returncode == 0)
    other = os.path.join(tmp, "someone-elses")
    os.makedirs(other)
    Path(other, "keep.txt").write_text("mine")
    r = demo("--into", other)
    check("refuses a folder it didn't make", r.returncode != 0 and Path(other, "keep.txt").exists())

sys.exit(1 if failures else 0)
