# Harness

A dark, amber-accented herdr window organized by machine. The sidebar lists every
connected machine with live CPU, RAM and per-GPU load rings and the agents running on it,
each with its session title, age and a status or context ring. Agent tabs open as a
chat (from [herdr-chat](https://github.com/azaeldrm/herdr-chat)) or their live terminal.
A status bar shows where you are and how much Claude Code and Codex quota is left.

![Harness](preview.png)

## What you see

Left to right: a sidebar, then the work column. There's no system title bar.

- **Sidebar** (268 px, `surface` `#0e1012`; drag 44–480 px, or fold to a 56 px rail,
  76 px on macOS):
  - **Brand** (46 px, drags the window): the animated Harness logo (28 px), "Harness"
    (16 px semibold), then Search and the sidebar toggle.
  - **Agents:** an "Agents" heading (11.5 px, dim) with a sort button. By default it's
    grouped by machine. Each group has the machine's name (this computer's own name, or
    a nickname), a + to start an agent there, a row of CPU, RAM and GPU rings (one per
    GPU, amber), then its agents. Each agent row (30 px) shows the program icon, the
    session's own title (else its folder, else the tab name), its age (`<1m`, `14h`,
    `1d`) and its status. Sub-agents hang under their parent as a tree (26 px rows).
    A machine with no agents says "No agents", "Connecting…" or "Offline".
  - **Footer** (92 px): Settings (with an amber dot when an update is ready) and Add
    machine.
- **Tab bar** (42 px, `chrome` `#0b0d0e`, drags the window): the space's tabs as labels
  with the program icon, the active one underlined in amber (2 px) with a close button;
  then +, Files, Changes, and the window buttons on Windows and Linux.
- **Work area** (12 px padding): the shown tab, as a chat or as terminal cards (10 px
  radius, 1 px `border`, a 42 px header with the Chat / Terminal toggle). Files or
  Changes open in a 368 px panel on the right.
- **Status bar** (42 px, `surface`): the shown space's machine and branch, the focused
  pane's folder, "N needs you" when agents on that machine are blocked, then Claude Code and Codex quota bars (44 × 4 px)
  and "Ctrl Shift P commands".

The theme is `harness`: background `#080a0b`, canvas `#060708`, text `#dededb`, accent and
working `#e9aa35`, done `#10a7a7`, idle `#80868b`, borders `#25282b`. Fonts are herdr's.

## How it behaves

- **Agent status**, in the sidebar: working is an amber ring spinning once every 900 ms;
  blocked is a "Needs you" badge (a "!" in the rail); done is a 7 px teal dot; idle is a
  ring filled to the share of the context window used (red `#d88179` above 90%, an empty
  ring when unknown). Tabs show the same spinner, or a dot for blocked and done.
- **Logo:** it fades in and out while any agent is working and bobs up and down otherwise.
  Clicking it folds or unfolds the sidebar.
- **Sidebar:** clicking an agent focuses it; hovering a row swaps its age for a pin, and
  pinned agents sit in a Pinned group on top. The sort button offers Priority (Needs you,
  Done, Working, Idle sections), Grouped by space and Grouped by machine. Group headers
  and parents with sub-agents fold. A machine's + opens the agents installed there.
- **Rings:** CPU, RAM and GPU refresh every second; hover one for its percentage. Missing
  readings stay empty, never 0%.
- **Tab bar:** click selects, double-click renames, drag reorders, right-click opens the
  tab menu, the scroll wheel moves between tabs. Files and Changes toggle the right panel,
  remembered per space.
- **Status bar:** each quota bar shows the 5-hour window and switches to 7 days while
  hovered, red above 90%; the tooltip gives the reset time. The last item opens the
  command palette.

## Built from

- **Layout** `layouts/herdr-harness.json`, cloned from `main`: root `row` (`titlebar:
  none`, theme `harness`, `terminal_padding [14, 12]`) → `sidebar` column [`brand`
  block, `agents` block, `sidebar-footer` block] and `work` column [`tabs` block,
  `work-body` row [`chat-view` stack of `chat-panel` and `terminal-panel`, hidden
  `panel` column with a `panel-body` stack of `files` and `changes`], `status` block].
- **Mods:**
  - `harness-chrome`: the brand bar, or the footer with props `{footer: true}`. Folds
    the sidebar with `layout.resize` and opens the shipped `picker` and `machine-add`.
  - `machine-agents`: the agents list, its sort popup (props `{sortMenu: true}`) and
    context rings. Calls `setAgentOrder`, `pane.focus` and `terminal.peek`.
  - `machine-metrics`: draws a machine's ring row (built into `machine-agents`).
  - `machine-new-menu`: the per-machine agent menu, from `knownAgents({on})`.
  - `harness-tabs`: the tab bar; uses the shipped `new-menu` and `menu`.
  - `workspace-status-machine`: the status bar. It also collects the stats: a built copy of
    `machine-stats` publishes shared `machine.stats`, `machine.usage` and
    `machine.local-label`.
  - `herdr-chat` (separate repo): the chat panel and the pane header with the toggle.
  - Shipped: `files`, `changes`, `picker`, `machine-add`, `new-menu`, `menu`.
- **Programs it runs** through `exec(..., {on: machine})`: per platform
  (`machine-stats/platforms.js`) a PowerShell or Python 3 probe, `nvidia-smi`,
  `uname -s`, `hostname`, `codex app-server` for Codex quota, and a read of
  `~/.claude/herdr-usage.json` for Claude quota. Context rings read snapshots written by
  `scripts/context-relay.py`.
- **Art:** `harness-logo-fade` and `harness-logo-bob` (WebP, SVG sources), monochrome SVG
  icons in `harness-chrome` and `machine-stats`, 101 generated context rings, Windows
  window icons in `harness-tabs`, program icons in `brand-assets/` and `programs.json`.

## Watch out

- Herdr won't import across mod folders, so `scripts/build-mods.py` copies code:
  `machine-metrics` into `machine-agents`, `machine-stats` into
  `workspace-status-machine`, `context-relay.py` into `context-probe.js`. Edit the
  sources and run it.
- The chat and the toggle need herdr-chat; without it those blocks show errors.
- Claude quota and context rings need `scripts/install-context.py` on each machine (on
  Windows, `scripts/install-claude-usage.ps1` also records quota). Without them those stay empty.
- Remote machines need Python 3. GPUs are NVIDIA only (AMD, Intel and Apple are empty
  entries in `machine-stats/gpus.js`). The macOS probe has never run on a Mac.
- The installer is `scripts/install.py`; `install.sh` and `install.ps1` only find Python and
  run it, so keep install logic there.
- `harness-pane` (a pane header) and `machine-spaces` (a Spaces list) are installed but
  the layout doesn't place them.
- Sizes are read from the `sidebar` node's width: below 160 px every sidebar mod draws
  its rail.

## Done when

- `herdr-app check` passes for every mod and `herdr-app status` shows no errors.
- Each connected machine has a group with live CPU, RAM and GPU rings, and its agents
  under it; a working agent spins and the logo fades.
- Folding the sidebar leaves icons, rings and statuses centered in the rail.
- The status bar names the focused pane's machine and folder and fills the quota bars.
- A Claude Code tab toggles between Chat and Terminal from its header.
