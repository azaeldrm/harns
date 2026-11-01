# Harness

A herdr layout with a sidebar organized by machine: agent sessions with status and
context rings, CPU/RAM/NVIDIA GPU load rings, Claude and Codex account usage in the
status bar, and its own look (the `harness` theme, logo, tabs and pane headers).
Everything uses herdr's existing machine connections; no HTTP endpoint is needed.

## What's in this repository

It is laid out like the herdr home (`~/.config/herdr-app`):

| Path | What it is |
|---|---|
| `layouts/herdr-harness.json` | the layout |
| `mods/harness-chrome`, `harness-tabs`, `harness-pane` | branding, sidebar toggle, tab and pane styling |
| `mods/machine-agents` | machine groups, add-agent buttons, agent navigation, status and context rings |
| `mods/machine-metrics` | CPU/RAM/per-GPU renderer (a built copy lives in `machine-agents`) |
| `mods/machine-stats` | machine probes and Claude/Codex account quota collection |
| `mods/workspace-status-machine` | the status bar: machine, folder and account usage bars |
| `mods/machine-new-menu`, `machine-spaces` | agent creation and the optional Spaces list |
| `themes/harness.json` | the theme |
| `brand-assets/`, `programs.json` | program icons (Codex knot, tinting for Claude Code, Codex and Pi) |
| `scripts/` | build and context-collection scripts |

The layout's chat panel and Chat/Terminal toggle come from
[herdr-chat](https://github.com/azaeldrm/herdr-chat), installed separately.

## Install

Requires the Herdr app and Python 3 (for building, context collection and Linux probing).

1. Install herdr-chat first.
2. From a clone of this repository, run `./install.ps1`. It builds the generated mod
   files, copies the mods, theme, brand assets and layout into `~/.config/herdr-app`
   (keeping a copy of any existing `herdr-harness` layout), merges the program icons into
   your `programs.json`, checks every mod, and switches to the layout. It won't switch if
   a mod the layout uses is missing, and says which. `-NoSwitch` installs without
   switching.

For per-session context rings, run `python scripts/install-context.py` locally and
`python scripts/install-context.py --on MACHINE` for each connected machine. See
[CONTEXT.md](CONTEXT.md) for hooks, reload requirements and limitations.

## How this repository is kept

On the machine it's made on, the repository is the herdr home itself. Herdr reads and
writes these files where it always does, and an allow-list `.gitignore` tracks only the
harness files, so whatever changes there, by hand, by an agent or by herdr, shows up in
`git status`. There is one copy and nothing to sync. Running `install.ps1` there only
rebuilds the generated files and checks the mods.

Generated files: `scripts/build-mods.py` writes `mods/machine-agents/machine-metrics.js`,
`context-probe.js` and `context-rings/`, and `mods/workspace-status-machine/machine-data.js`
and `probes.js`, from `mods/machine-metrics`, `scripts/context-relay.py` and
`mods/machine-stats`. Edit the sources, then run it (or `install.ps1`).

## How it measures

Windows CPU load uses differences between performance counter samples; RAM uses
operating-system memory counters. Linux uses `/proc`. NVIDIA load uses `nvidia-smi`,
with one ring per reported GPU. Machine probes run every second without overlapping on a
host; context snapshots refresh every two seconds; quota reads run every 30 seconds.
Missing readings stay unknown. Quota values come from native account data, never terminal
conversation text.

## Validation

Run `herdr-app check <absolute mod folder>` after edits, then inspect `herdr-app status`
and `herdr-app shot`. Collector tests:
`python -m unittest discover -s tests -p test_context_relay.py`.

UI changes are hot-reloaded; there's no need to restart the app to apply them.
