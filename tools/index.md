# tools/ index

Developer and build tooling for the GNOME Widget Panel. Parent:
[`../index.md`](../index.md).

## Files

- [`format-generated.mjs`](format-generated.mjs) — build post-processor run after
  `tsc` in [`../gwp build`](../gwp). `tsc` strips every blank line when it
  emits JS, so it reinserts the AGENTS.md "Code formatting" spacing into every
  generated `extension/**/*.js` (two blank lines between top-level functions,
  three between top-level classes including `GObject.registerClass(...)`
  assignments, one blank line separating the import block, comments kept attached
  to the declaration below them). Idempotent.
- [`ego-status.py`](ego-status.py) — reports where the extension stands on
  extensions.gnome.org: the credential-free `/extension-info/?uuid=…` probe
  (404 until published) plus, with `EGO_USERNAME`/`EGO_LOGIN` and
  `EGO_PASSWORD`, the author-visible per-version status table, the **reviewer's
  comments** and the **Shexli** findings for every submitted version.
  `--state FILE` diffs against the previous run and exits 20 on any change, so a
  watcher can poll it. See
  [`../docs/process/promotion.md`](../docs/process/promotion.md).
- [`wiki-screenshots.sh`](wiki-screenshots.sh) — regenerates the published
  screenshots (panel, collapsed panel, settings window) headlessly on top of the
  UI test harness, so refreshing the wiki assets needs no human clicking and
  touches nothing in the user's session. Output lands in
  `dist/wiki-screenshots/`; see [`../docs/process/promotion.md`](../docs/process/promotion.md).

## Directories

- [`dev-screenshot/`](dev-screenshot/README.md) — helper GNOME Shell extension
  and script that capture a screenshot of the running dev shell for scripted
  debugging.
