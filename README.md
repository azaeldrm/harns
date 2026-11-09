# Harness

A herdr layout organized by machine: each machine's CPU, RAM and GPU load and its agents
in the sidebar, agent tabs as a chat or a terminal, and Claude Code and Codex quota in the
status bar. Everything goes through herdr's own machine connections.

![Harness](preview.png)

[RECIPE.md](RECIPE.md) describes it in full, as a brief to build it from.

## Install

Needs the Herdr app and Python 3 on each machine. The chat in agent tabs is
[herdr-chat](https://github.com/azaeldrm/herdr-chat): the installer adds it when it isn't
installed yet (`--no-chat`, or `-NoChat`, to skip) and never replaces a copy you have.

Ask your agent to add this layout, or run the installer from a clone: `./install.sh` on
Linux and macOS, `./install.ps1` on Windows (both run `scripts/install.py`). It builds the
generated files, copies the mods, theme, assets and layout into
`~/.config/herdr-app`, merges the program icons into your `programs.json`, checks every
mod, installs this computer's relays (below) and switches to `herdr-harness`
(`--no-switch`, or `-NoSwitch` on Windows, to skip). `ctrl-shift-l` switches back.

Optional:

- **Context rings** come from relays: Claude Code's status line and a Pi extension
  (`scripts/install-context.py`, on Windows, Linux and macOS); Codex's comes from its footer.
  The Claude Code and Codex quota bars read the account from each service and need no relay. The installer sets them up on this computer (`--no-relays`, or `-NoRelays`, to
  skip); for each connected machine run `python scripts/install-context.py --on MACHINE`.
  See [CONTEXT.md](CONTEXT.md).
- **This computer's name:** it shows the computer's own name. For a nickname, put
  `{ "localMachineName": "my-pc" }` in `~/.config/herdr-app/harness.json`.

## Platforms

| | CPU and RAM | GPUs |
|---|---|---|
| Windows | PowerShell counters | NVIDIA |
| Linux | Python 3, `/proc` | NVIDIA |
| macOS | Python 3, `top` and `vm_stat` | — |

Each machine's platform is detected once (`mods/machine-stats/platforms.js`). GPU vendors
are entries in `mods/machine-stats/gpus.js`, with a place for AMD, Intel and Apple.

## Working on it

- Edit the sources in a clone, then run the installer (`--no-switch --no-relays` while
  developing). It runs `scripts/build-mods.py`, which writes the copies herdr needs (see
  RECIPE.md, Watch out), and copies the result into `~/.config/herdr-app`.
- Check with `herdr-app check <mod folder>`, `herdr-app status` and `herdr-app shot`.
- Tests: `python -m unittest discover -s tests`, `node tests/usage.mjs`,
  `node tests/turns.mjs`, `node tests/probes.mjs`, `node tests/snapshots.mjs`, `node tests/markdown.mjs` and `npm run check:pele` (the vendored
  Pele matches its pin; after `npm install` it compares every byte).
- `harness-files` is herdr's Files panel where Markdown and `.mmd` files open as a readable
  document: images (beside the file or on its machine; web images show as links, never fetched) and
  mermaid blocks drawn by Pele (the same pinned version as herdr-chat). Preview and
  Source in its header switch views. To update Pele, change the pin in `package.json`, then run
  `npm install && npm run vendor:pele`.
