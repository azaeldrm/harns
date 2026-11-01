# Harness sidebar mods

Native Herdr mods for a sidebar organized by machine, with CPU/RAM/NVIDIA GPU
load rings, agent sessions, account quotas, and per-session context rings.
Everything uses Herdr's existing machine connections; no HTTP endpoint is needed.

## Install and update

Run `./install.ps1` for initial installation, or `./scripts/apply-style.ps1`
to update an existing personal `machine-stats` layout. The app hot-reloads mods.
The style script calls `python scripts/build-mods.py` first to generate runtime
bundles and matching spinner/context-ring assets from their canonical sources.
Python 3 is required for context collection and Linux machine probing.

For per-session context integration, run `python scripts/install-context.py`
locally and `python scripts/install-context.py --on MACHINE` for each connected
machine. See [CONTEXT.md](CONTEXT.md) for hooks, reload requirements and limitations.

## Runtime modules

- `harness-chrome`, `harness-tabs`, `harness-pane`: branding, sidebar toggle,
  tab and pane styling. Custom icon assets live in `harness-chrome`.
- `machine-agents`: machine groups, add-agent buttons, agent navigation and
  status/context rings. Working agents spin; idle agents show context fullness.
- `machine-metrics`: canonical CPU/RAM/per-GPU renderer. Its runtime copy inside
  `machine-agents` is generated because Herdr isolates each mod's imports.
- `machine-stats`: machine probes and Claude/Codex account quota collection.
  Publishes counters to shared state; bundled into the bottom bar as its collector base.
- `workspace-status-machine`: machine/folder information and hover-switching account usage bars in the bottom bar. The former sidebar Usage section has been removed.
- `machine-new-menu`, `machine-spaces`: agent creation and optional Spaces UI.

Windows CPU load uses differences between performance counter samples; RAM uses
operating-system memory counters. Linux uses `/proc`. NVIDIA load uses
`nvidia-smi`, with one ring per reported GPU. Machine probes run every second
without overlapping on a host; context snapshots refresh every two seconds;
quota reads run every 30 seconds. Missing readings stay unknown.

The current interface displays load percentages, not temperatures or hardware
names. The obsolete temperature helper tools and duplicate `workspace-chrome`
implementation have been moved to a dated backup outside the project. Active
mods use their own `harness-chrome` assets rather than modifying shipped mods.
Quota values come from native account data, never terminal conversation text.

## Validation

Run `herdr-app check <absolute mod folder>` after edits, then inspect
`herdr-app status` and `herdr-app shot`. Collector tests:
`python -m unittest discover -s tests -p test_context_relay.py`.

UI changes are hot-reloaded; avoid restarting the app to apply them.
