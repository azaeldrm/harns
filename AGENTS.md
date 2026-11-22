# AGENTS.md

## Project overview

Layouts and mods for the Herdr desktop app, published on herdr.dev. Each folder with a `RECIPE.md` and a `preview.png`
is one listing; herdr.dev indexes this repository (topic `herdr-layout`) within the hour of a push to `main`, so `main`
is always releasable. Herdr's API reference is `~/.config/herdr-app/AGENTS.md`; each listing's `RECIPE.md` describes
what it is.

| Listing | Folder | Mods |
|---|---|---|
| harns (layout) | `layouts/harns/` | `harns-chrome`, `harns-tabs`, `harns-settings`, `harns-status`, `machine-sidebar`, `markdown-files`, `emulator`, `agent-chat` |
| herdr-chat (layout) | `layouts/herdr-chat/` | `agent-chat` |
| agent-chat (mod) | `mods/agent-chat/` | `agent-chat` |
| markdown-files (mod) | `mods/markdown-files/` | `markdown-files` |
| mod listings (planned) | `mods/<name>/` | `machine-sidebar`, `emulator` |

## Structure

- `src/<mod>/`: each mod's source, the place to edit mod code.
- `src/shared/`: code and art several mods use, including the one icon set (`icons/`).
- `layouts/<listing>/`: a listing's `RECIPE.md`, `preview.png`, layout files, theme and program icons, plus `mods/`,
  built from `src/`.
- `scripts/package.py`: builds every listing's `mods/`. A mod gets each shared file it imports (`./layout.js`) and each
  icon it loads from `mods/<itself>/icons/`.
- `scripts/install.py`: installs the harns listing into `~/.config/herdr-app`.
- `tests/`: Node and Python tests, run against the built mods.
- `demo/`: trailhead, the demo project for screenshots, as files; `scripts/demo.py` builds it as a git checkout.

## Commands

```sh
python scripts/package.py                        # build the listings from src/
npm test                                         # checks the listings are current, then runs every test
herdr-app check layouts/harns/mods/<mod>         # load a mod once
python scripts/install.py --no-switch --no-relays   # install into the live app
python scripts/demo.py [--on <machine>] [--branch <b>]   # build the demo project in ~/.cache/harns-demo
herdr-app status                                 # what the app shows, and errors
npm install && npm run vendor:pele               # update the vendored Pele (mermaid)
```

## Workflow

1. Edit `src/` (and the listing files they affect), build, test, check each changed mod.
2. Install and look at the change in the app.
3. Keep `RECIPE.md` and `README.md` in step with the code in the same change.

The repository's git hooks run `install.py` on commit, checkout and merge. For a worktree or a branch you want kept out
of the live app, set `git -c core.hooksPath=<empty folder>` for those commands.

## Conventions

- Each mod is self-contained: it loads pictures from its own folder, and shared code reaches it through `package.py`.
- Mod names: `harns-*` for pieces used inside harns, descriptive names for mods that ship alone. Settings and state keys
  (`harness.*`, `herdr-chat.*`) keep their names. Renames go through `install.py`'s `RENAMED`, which carries saved state
  and key bindings to the new name.
- One mod can open in several forms through its props (the sidebar's + menu, the Markdown window).
- Sizes from `on_size_change` are zoomed pixels: convert with `designPx`.
- Effects tied to an event (a ripple on landing) are driven from the view, one native `transition` per step.
- Design choices are shown first, as a throwaway preview dialog in `~/.config/herdr-app/mods/`, then removed.
- Screenshots use the demo project trailhead (`demo/`, built with `scripts/demo.py`); the folder and branch names of
  real sessions are blurred.
- No comments in code, only docstrings: a `/** */` block right above a function, method or class in JavaScript, its
  docstring in Python, saying its purpose in full sentences wrapped at about 120 columns. What a docstring can't hold
  goes in `RECIPE.md` or the commit message. Shebangs and markers code reads (`# harns: points adb` in `adb.sh`) stay.
- Logic lives in modules that take herdr's functions as arguments, with tests.
- What the person makes or chooses is kept in shared state (agent-chat's `Kept`), not on a view: a reload starts views
  over.

## Herdr behaviors to design around

- `fs.writeFile` saves binary data as an empty file and `Buffer` encodes base64 as `""`: write base64 text and let the
  system decode it (see `markdown-files/images.js`).
- `herdr-app shot` returns the last drawn frame, which is stale while the window is covered; a screen capture shows the
  window when it's in front.
- A dialog opens once other overlays close; `herdr-app status` lists the open ones.
- herdr keeps an element's animation state by its id across the view: two animated elements sharing an id (the same
  ripple name in two rows) take each other's position and transitions. Give them ids unique to what they belong to.

## Git and PRs

- Commit, push and merge when the person asks, one merge command at a time.
- One focused PR per change, stacked on an open PR when it depends on it. Descriptions end with a Checks section.
- Review a PR's diff for stale code, docstrings and docs before merging. Pushed history stays as it is: fix with a new
  commit and squash-merge when a change needs to stay out of `main`.

## Environment

- Windows, Git Bash and PowerShell. Python is `python`. Write multi-line edit scripts to files (heredocs mangle escapes),
  and keep files' CRLF line endings.
