# UI testing

`@tag:ui-testing`

Back to the [docs index](index.md). Harness code lives in
[`../tests/ui/`](../tests/ui/index.md).

UI tests serve two distinct purposes with different lifecycles:

1. **Regression tests** (committed, `tests/ui/t-*.sh`) — run before a release:
   `npm run test:ui`.
2. **Feature-debug scripts** (throwaway, NOT committed) — copy the committed
   stub, iterate on a feature, delete:
   `cp tests/ui/feature-debug.stub.sh tests/ui/local-mydebug.sh` (`local-*` is
   gitignored).

## Approaches considered

| Approach | Verdict | Why |
| --- | --- | --- |
| `org.gnome.Shell.Eval` D-Bus (+ `--unsafe-mode`) | ✗ unavailable | GNOME Shell 50 removed the `--unsafe-mode` switch; `Eval` returns `(false, '')` and `org.gnome.Mutter.DebugControl` exposes no unsafe-mode toggle (verified empirically). |
| **Test-driver extension** (own `Eval` via D-Bus) | ✓ **chosen** | 90-line test-only extension ([`../tests/ui/driver/`](../tests/ui/driver/)) exports `org.gwp.TestDriver.Eval(script)`; runs only inside the isolated test session; version-proof; awaits Promise results so async shell APIs work. |
| **Headless shell** (`gnome-shell --headless --virtual-monitor`) | ✓ **chosen** | Real compositor + real rendering (llvmpipe) with no window; the same mechanism `dev-run.sh` uses. Each test boots a throwaway, fully isolated session (own bus / extensions dir / dconf profile, so its own `widgets` GSettings key). |
| **Virtual pointer** (`Clutter.VirtualInputDevice`) | ✓ **chosen** | Real input events through the whole picking/reactive path — clicks verified to open the overview headless. Preferred over `actor.emit('clicked')`, which bypasses picking (emit also works and is fine for quick debug). |
| **Actor introspection asserts** | ✓ **chosen** | Most assertions read actor state via `Eval` (position, size, orientation, style, children) — robust, fast, precise failure messages. The primary assertion style. |
| Screenshots — smoke test | ✓ chosen (t-07) | `Shell.Screenshot.screenshot_stage_to_content` + `composite_to_stream` writes a stage PNG headless; the committed test only asserts a non-uniform render. |
| Screenshots — golden-image comparison | ✗ not committed | Pixel-exact references break on theme/font/GPU-rasterizer changes and bloat the repo. Use locally for feature work: capture with `ui_screenshot`, eyeball or diff with [`../tests/ui/png-stats.js`](../tests/ui/png-stats.js). Revisit (with masks + tolerances, e.g. openQA-style) only if visual regressions become frequent. |
| AT-SPI / dogtail | ✗ not now | Would drive the GTK **preferences** window via accessibility; heavier deps. Prefs pages are covered cheaper by GJS harness scripts (construct `fillWidgetPreferences` in plain GJS). A future option for full prefs-window interaction tests. |
| GNOME Shell perf framework / openQA | ✗ not now | Aimed at shell-internal performance and distro-level QA respectively; too heavy for an extension. |

## Architecture

```
tests/ui/run.sh                 runner: build once, run each t-*.sh
  └── t-NN-*.sh                 sources lib.sh, calls ui_start, asserts
        └── lib.sh              re-execs the test under dbus-run-session:
              gnome-shell --headless --virtual-monitor 1280x720
                ├── gnome-widget-panel@…    (symlink to extension/)
                └── gwp-test-driver@gwp.test (tests/ui/driver)
                      └── org.gwp.TestDriver.Eval(js) ← gdbus (ui_eval)
```

Isolation per test: own D-Bus session bus, `XDG_DATA_HOME` (extensions dir) and
dconf profile (`user-db:gwpuitest` — one throwaway db file), so the widget
configuration (the `widgets` GSettings key) is isolated too. Apart from that one
throwaway dconf db file, nothing touches the real session. One shell
boot per test file (~15–25 s each) keeps tests independent; a crashed shell
fails only its own test.

The **driver** is an arbitrary-code endpoint by design — it must only ever be
enabled in this throwaway session (see the warning in its source).

Flakiness policy: never assert immediately after a settings/config write — use
`ui_wait_js` (polling, generous timeouts). Every wait has a hard timeout, every
test a runner-level `timeout`. On failure the artifacts dir (shell.log,
screenshots) is kept and its path printed.

## Running

```bash
npm run test:ui                 # build + all regression tests
tests/ui/run.sh t-02 t-05      # subset (filename filter)
SKIP_BUILD=1 tests/ui/run.sh   # reuse existing extension/ build
GWP_UI_KEEP=1 tests/ui/run.sh  # keep per-test artifacts dirs
```

Requires a GNOME 50 host with `gnome-shell` and `dbus-run-session` (headless
rendering uses llvmpipe; no display needed). Not part of `npm test` (which
stays Node-only and CI-cheap).

## Writing a regression test

Copy the shape of [`../tests/ui/t-02-orientation-live.sh`](../tests/ui/t-02-orientation-live.sh):
source `lib.sh`, `ui_start [config-json]`, then assert. In `ui_eval` scripts
the prelude defines `find(actor, pred)`, `panel` (the FloatingMiniPanel actor)
and `plugin(id)` (a widget's actor, via `_panelPluginId`); the last expression
is returned as JSON; returned Promises are awaited. Keep every post-write
assertion inside `ui_wait_js`.

## Debugging a feature

`cp tests/ui/feature-debug.stub.sh tests/ui/local-<name>.sh`, edit, run, throw
away. The stub shows all the tools: boot with a custom widget set, introspect
actors, poke GSettings live, click with the virtual pointer, screenshot the
stage and read the shell log. For *visual/interactive* debugging use
[`development.md`](development.md) (`./dev-run.sh`, a real nested window)
instead — the headless harness is for scripted checks.
