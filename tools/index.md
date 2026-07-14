# tools/ index

Developer and build tooling for the GNOME Widget Panel. Parent:
[`../index.md`](../index.md).

## Files

- [`format-generated.mjs`](format-generated.mjs) — build post-processor run after
  `tsc` in [`../build.sh`](../build.sh). `tsc` strips every blank line when it
  emits JS, so it reinserts the AGENTS.md "Code formatting" spacing into every
  generated `extension/**/*.js` (two blank lines between top-level functions,
  three between top-level classes including `GObject.registerClass(...)`
  assignments, one blank line separating the import block, comments kept attached
  to the declaration below them). Idempotent.

## Directories

- [`dev-screenshot/`](dev-screenshot/README.md) — helper GNOME Shell extension
  and script that capture a screenshot of the running dev shell for scripted
  debugging.
