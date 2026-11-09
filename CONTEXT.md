# Per-session context rings

Working agents retain their spinner. Idle and completed agents use the latest
reported context percentage. Hover shows that percentage. A ring waiting for its
first reading stays muted rather than showing 0%.

Snapshots are keyed by `HC_TERMINAL_ID`, qualified with the machine name by the
sidebar, and checked against the terminal creation time. Folder names are not
used for session matching. The sidebar reads a machine's snapshots when one of its
agents finishes a turn, appears or goes away, or the machine comes online (from herdr's
own agent list, so only machines with activity are asked), watches this computer's snapshot folder,
and clears readings when the machine is unavailable. Codex's ring is what its footer says
("Context N% left", read with `hc read`), so it needs no relay; it appears when
`context-remaining` is one of Codex's `tui.status_line` items.

## Installation

`install.sh` and `install.ps1` install the relays on this computer (`--no-relays` to skip).
For a connected machine run `python scripts/install-context.py --on MACHINE`; it needs
Python 3 there (`python3` or `python`). The installer backs up Claude's configuration
before changing it and creates Claude's settings file when there is none.

- Pi: a separate global extension publishes `getContextUsage()` counters every
  second. Existing sessions pick it up after `/reload`, typed in their terminal
  (sent with `hc send`, it arrives as a message).
- Claude: the status-line relay captures session ID and `context_window` fields.
  An existing custom status-line command is saved and forwarded the same input;
  its output is preserved. Early null percentages remain unknown.
- Codex: nothing to install (its footer, above).

Only identifiers and numeric counters are written under `~/.config/harness/`.
No server, model request, prompt, or conversation content is sent to a service.
The usage meters are separate: see RECIPE.md.
