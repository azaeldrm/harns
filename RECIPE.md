# Harness

A dark, amber-accented herdr window organized by machine. The sidebar lists every
connected machine with live CPU, RAM and per-GPU load rings and the agents running on it,
each with its session title, age and a status or context ring. Agent tabs open as a
chat (from [herdr-chat](https://github.com/azaeldrm/herdr-chat)) or their live terminal.
A status bar shows where you are and how much Claude Code and Codex quota is left.

![Harness](preview.png)

Needs [herdr-chat](https://github.com/azaeldrm/herdr-chat) for the chat and the toggle: the
installer adds it, and adding this layout by hand means adding that repository's mod too.

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
- **Work area** (12 px padding): the shown tab, as a chat (where a new agent session starts) or as terminal cards (10 px
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
- **Rings:** CPU, RAM and GPU refresh every second; hover one for its percentage. A ring
  stays empty until its first reading arrives.
- **Usage meters:** Claude's and Codex's limits belong to the account, so the bar shows one
  reading per service on every machine, from the service itself: Anthropic's OAuth usage
  endpoint with Claude Code's login, and `codex app-server`'s `account/rateLimits/read`. Each
  reading replaces the last (kept in shared `machine.usage` across restarts), so a usage reset
  shows at once. They're read when herdr starts, 2 s after a turn ends (seen in herdr's agent
  list: Claude Code's turn reads Claude, Codex's Codex, Pi's both) and every 15 minutes, for
  use outside herdr. They're asked on this computer, or on the first ready machine where the
  service is installed and signed in. A window past its reset reads 0%; a service signed out
  everywhere says so in the tooltip.
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
  (`machine-stats/platforms.js`) a PowerShell or Python 3 stats probe every second, the
  account probe above (an HTTPS request to Anthropic and a short-lived `codex app-server`),
  `nvidia-smi`, `uname -s` and `hostname`. Context rings read the relays' snapshots after
  turns end: this computer's directly (no process, as the relays write them), another
  machine's with `scripts/context-relay.py`'s collect() there; and Codex's footers with
  `hc read`.
- **Art:** `harness-logo-fade` and `harness-logo-bob` (WebP, SVG sources), monochrome SVG
  icons in `harness-chrome` and `machine-stats`, 101 generated context rings, Windows
  window icons in `harness-tabs`, program icons in `brand-assets/` and `programs.json`.

## Watch out

- Each herdr mod imports from its own folder, so `scripts/build-mods.py` copies shared code:
  `machine-metrics` into `machine-agents`, `machine-stats` into
  `workspace-status-machine`, `context-relay.py` into `context-probe.js`. Edit the
  sources and run it.
- The chat and the toggle need herdr-chat; without it those blocks show errors. The installer
  adds it from its repository when it's missing and never replaces an installed copy.
- Claude's and Pi's context rings come from the relays (`scripts/install-context.py`) on each
  machine: the installer sets them up on this computer, and `--on MACHINE` on the others. The
  usage meters need only a machine where Claude Code and Codex are signed in. Claude's usage
  comes from Anthropic's OAuth usage endpoint with the `anthropic-beta: oauth-2025-04-20`
  header.
- Other machines need Python 3. GPU rings read NVIDIA cards through `nvidia-smi`; other vendors
  go in `machine-stats/gpus.js`, which has an entry for each.
- The installer is `scripts/install.py`; `install.sh` and `install.ps1` find Python and run it,
  so install logic belongs in `install.py`.
- `harness-files` replaces herdr's `files` block (same block id, so its clicks survive). It is
  herdr's Files plus a Markdown view, and `vendor/pele` comes from `npm run vendor:pele`. Don't
  edit the vendored copy. With props `{ file }` it is a viewer for that one file.
- `harness-pane` is a pane header for layouts that want one; Harness itself uses herdr-chat's.
- Sizes are read from the `sidebar` node's width: below 160 px every sidebar mod draws
  its rail.

## Done when

- `herdr-app check` passes for every mod and `herdr-app status` shows no errors.
- Each connected machine has a group with live CPU, RAM and GPU rings, and its agents
  under it; a working agent spins and the logo fades.
- Folding the sidebar leaves icons, rings and statuses centered in the rail.
- The status bar names the focused pane's machine and folder and fills the quota bars.
- A new Claude Code tab opens on its chat and toggles to Terminal from its header.
- Running the installer where herdr-chat isn't installed adds it; running it again leaves no layout
  backup behind.
