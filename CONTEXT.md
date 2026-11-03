# Per-session context rings

Working agents retain their spinner. Idle and completed agents use the latest
reported context percentage. Hover shows the percentage and token counts when
available. Unknown readings stay muted; they are never displayed as 0%.

Snapshots are keyed by `HC_TERMINAL_ID`, qualified with the machine name by the
sidebar, and checked against the terminal creation time. Folder names are not
used for session matching. The sidebar refreshes every two seconds and clears
readings when the machine is unavailable.

## Installation

Run `python scripts/install-context.py` locally or
`python scripts/install-context.py --on MACHINE` for a connected machine.
The installer backs up Codex and Claude configuration before changing it.
Install the sidebar files with `install.sh` or `install.ps1` as usual.

- Pi: a separate global extension publishes `getContextUsage()` counters every
  second. Existing sessions need a literal `/reload` in their terminal. Do not
  use `hc send` for slash commands: its sender envelope turns them into messages.
- Claude: the status-line relay captures session ID and `context_window` fields.
  An existing custom status-line command is saved and forwarded the same input;
  its output is preserved. Early null percentages remain unknown. Windows can
  also use the updated original PowerShell usage relay.
- Codex: a notify hook captures the exact thread ID after a response. The reader
  follows that session's rollout token-count events using `last_token_usage`
  and `model_context_window`, never cumulative session token expenditure.
  Existing sessions pick up notification configuration on their next start;
  a new thread needs its first response before its mapping is available.
  An unrelated existing notify command is preserved and needs manual chaining.

Only identifiers and numeric counters are written under `~/.config/harness/`.
No server, model request, prompt, or conversation content is sent to a service.
The Codex reader reads a bounded local log tail to extract token-count events.
The separate account quota panel is unaffected.
