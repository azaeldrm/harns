# demo

trailhead, the small project harns's screenshots show: a hiking log with a Python API, a web page, trail data and a
README with a diagram. It's here as plain files; `scripts/demo.py` turns it into a real git checkout.

```sh
python scripts/demo.py                                        # this computer, on main
python scripts/demo.py --branch feat/elevation-chart          # with its README edit left uncommitted
python scripts/demo.py --on homelab --branch fix/gpx-import   # another machine, through hc
```

Each lands in `~/.cache/harns-demo/trailhead` on that machine (`--into` for elsewhere), with three commits on `main`
and one on each branch, the same on every machine. A rebuild replaces only a folder the script made.

- `trailhead/`: the files on `main`.
- `branches/<name>/`: what each branch changes (`feat/elevation-chart`, `fix/gpx-import`).
- `wip/<name>/`: the change left uncommitted when that branch is checked out.

This folder isn't a listing (no `RECIPE.md` or `preview.png`), and `package.py` doesn't read it.
