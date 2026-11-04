# Harness

A herdr layout organized by machine: each machine's CPU, RAM and GPU load and its agents
in the sidebar, agent tabs as a chat or a terminal, and Claude Code and Codex quota in the
status bar. Everything goes through herdr's own machine connections.

![Harness](preview.png)

[RECIPE.md](RECIPE.md) describes it in full, as a brief to build it from.

## Install

Needs the Herdr app, Python 3 on each machine, and
[herdr-chat](https://github.com/azaeldrm/herdr-chat) installed first.

Ask your agent to add this layout, or run the installer from a clone: `./install.sh` on
Linux and macOS, `./install.ps1` on Windows (both run `scripts/install.py`). It builds the
generated files, copies the mods, theme, assets and layout into
`~/.config/herdr-app`, merges the program icons into your `programs.json`, checks every
mod, installs this computer's relays (below) and switches to `herdr-harness`
(`--no-switch`, or `-NoSwitch` on Windows, to skip). `ctrl-shift-l` switches back.

Optional:

- **Claude Code quota and context rings** come from relays: Claude Code's status line,
  Codex's notify hook and a Pi extension (`scripts/install-context.py`, on Windows, Linux and
  macOS). The installer sets them up on this computer (`--no-relays`, or `-NoRelays`, to
  skip); for each connected machine run `python scripts/install-context.py --on MACHINE`.
  See [CONTEXT.md](CONTEXT.md).
- **This computer's name:** it shows the computer's own name. For a nickname, put
  `{ "localMachineName": "my-pc" }` in `~/.config/herdr-app/harness.json`.

## Platforms

| | CPU and RAM | GPUs |
|---|---|---|
| Windows | PowerShell counters | NVIDIA |
| Linux | Python 3, `/proc` | NVIDIA |
| macOS | Python 3, `top` and `vm_stat` (untested) | none yet |

Each machine's platform is detected once (`mods/machine-stats/platforms.js`). GPU vendors
are entries in `mods/machine-stats/gpus.js`; AMD, Intel and Apple are there to fill in.

## Working on it

Here the repository is the herdr home itself: an allow-list `.gitignore` tracks only
these files, so there's one copy and herdr's edits show up in `git status`.

- Edit the sources, then run `python scripts/build-mods.py`. It writes the copies herdr
  needs (see RECIPE.md, Watch out).
- Check with `herdr-app check <mod folder>`, `herdr-app status` and `herdr-app shot`.
- Collector tests: `python -m unittest discover -s tests -p test_context_relay.py`.
