# tests/ui — headless GNOME Shell UI tests

`@tag:ui-testing`

Back to [tests](../index.md). Concept, options analysis and how-to:
[`../../docs/ui-testing.md`](../../docs/ui-testing.md).

## Files

- [`run.sh`](run.sh) — regression runner (`npm run test:ui`); builds, then runs
  every `t-*.sh` in its own isolated headless shell session.
- [`lib.sh`](lib.sh) — harness library: session bootstrap (`ui_start`), shell
  JS evaluation (`ui_eval`), polling waits, GSettings helpers, virtual-pointer
  clicks, screenshots, assertions.
- `t-01-panel-loads.sh` — panel loads, widgets in config order, no JS errors.
- `t-02-orientation-live.sh` — `orientation` setting applies live; graphs rotate.
- `t-03-content-padding-live.sh` — `content-padding` applies/clears live.
- `t-04-position-preset.sh` — `aligned` presets snap the panel.
- `t-05-config-live-reload.sh` — `widgets` GSettings key edits live-reload;
  broken config is ignored.
- `t-06-gnome-action-click.sh` — virtual-pointer click opens the overview.
- `t-07-screenshot-smoke.sh` — stage renders and captures to a non-uniform PNG.
- [`feature-debug.stub.sh`](feature-debug.stub.sh) — copy-paste boilerplate for
  throwaway feature-debug scripts (`local-*` copies are gitignored).
- [`png-stats.js`](png-stats.js) — PNG pixel statistics (screenshot smoke +
  local golden comparisons).

## Directories

- [`driver/`](driver/gwp-test-driver@gwp.test/extension.js) — test-only GNOME
  Shell extension exporting `org.gwp.TestDriver.Eval` on the test session bus
  (replaces the removed `org.gnome.Shell.Eval`). Never enable it in a real
  session.
