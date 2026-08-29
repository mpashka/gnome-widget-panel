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
- [`wiki-screenshots.sh`](wiki-screenshots.sh) — regenerates the published
  screenshots (panel, collapsed panel, settings window) headlessly on top of the
  UI test harness, so refreshing the wiki assets needs no human clicking and
  touches nothing in the user's session. Output lands in
  `dist/wiki-screenshots/`; see [`../docs/process/promotion.md`](../docs/process/promotion.md).

## Directories

- [`dev-screenshot/`](dev-screenshot/README.md) — helper GNOME Shell extension
  and script that capture a screenshot of the running dev shell for scripted
  debugging.
