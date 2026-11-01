# Maintaining the Harness mods

Use [README.md](README.md) for the current architecture and installation flow.
Use [CONTEXT.md](CONTEXT.md) for native session collectors and their limitations.
The earlier recipe described temperature panels and terminal-text quota scraping;
those no longer describe the active UI.

Read Herdr's installed AGENTS.md and type definitions before changing native UI.
Edit personal mods and the cloned layout; never overwrite shipped mods.

Canonical generated-code inputs:
- `mods/machine-metrics/main.js`
- `scripts/context-relay.py`
- circle geometry in `scripts/build-mods.py`

Run `python scripts/build-mods.py` after changing these sources. Do not hand-edit
`machine-agents/machine-metrics.js`, `context-probe.js`, or `context-rings/`.
`install.ps1` rebuilds these before installing.

Preserve fixed footer rows in both sidebar widths, centered compact columns,
per-machine grouping, matching context/spinner geometry and unknown readings.
Validate with mod checks, app status and screenshots in both sidebar widths.
