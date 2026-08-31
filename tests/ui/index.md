# tests/ui — headless GNOME Shell UI tests

`@tag:ui-testing`

Back to [tests](../index.md). Concept, options analysis and how-to:
[`../../docs/testing/ui-testing.md`](../../docs/testing/ui-testing.md).

## Files

- [`run.sh`](run.sh) — regression runner (`npm run test:ui`); builds, then runs
  every `t-*.sh` in its own isolated headless shell session.
- [`lib.sh`](lib.sh) — harness library: session bootstrap (`ui_start`), shell
  JS evaluation (`ui_eval`), polling waits, GSettings helpers, virtual-pointer
  clicks (`ui_click` primary-button shorthand, `ui_click_button` for another
  button and/or a press-and-hold duration), screenshots, assertions.
- `t-01-panel-loads.sh` — panel loads, widgets in config order, no JS errors.
- `t-02-orientation-live.sh` — `orientation` setting applies live; graphs rotate.
- `t-03-content-padding-live.sh` — `content-padding` applies/clears live.
- `t-04-position-preset.sh` — `aligned` presets snap the panel.
- `t-05-config-live-reload.sh` — `widgets` GSettings key edits live-reload;
  broken config is ignored.
- `t-06-gnome-action-click.sh` — virtual-pointer click opens the overview.
- `t-07-screenshot-smoke.sh` — stage renders and captures to a non-uniform PNG.
- `t-08-all-widgets.sh` — every registered widget loads in one panel, no JS errors.
- `t-09-live-reload-ai-widgets.sh` — a Soup.Server-backed widget keeps a bound
  server across a live config reload (the port-bind race).
- `t-10-right-click-menu.sh` — a right-click on the drag handle (`ctlBtn`) held
  slightly longer than an instant tap still opens/closes its context menu
  (issue #3, `controlButton.ts` `LONGPRESS_MS`), and a genuine long right-press
  now does nothing at all: the temporary-hide it used to fire was replaced by the
  explicit Collapse/Expand item (`t-15-collapse.sh`).
- `t-11-drag-starts-immediately.sh` — dragging the drag handle starts on the
  first pointer movement, not after the `LONGPRESS_MS` timer, so raising that
  threshold for right-click does not make the widget feel "glued" (issue #3
  follow-up, `controlButton.ts` MOTION handler).
- `t-13-disable-enable-no-crash.sh` — disabling and re-enabling the extension (the
  path the shell drives around screen lock/unlock) does not throw; the panel
  returns and no `super.destroy` / JS error is logged (issue #7 regression).
- `t-14-agent-status-merge.sh` — ai-agent-status collapses several sessions into
  one dot showing the most-urgent state (priority `waiting > idle > thinking`),
  statusline activity never demotes `waiting`, and the placeholder returns when
  empty.
- `t-15-collapse.sh` — the Collapse/Expand menu item on the drag handle: only
  the handle stays visible, its menu still opens (the only way back), the state
  persists in the `collapsed` key, expanding restores every widget, and a widget
  live-reload does not silently expand a collapsed panel.
- `t-16-clock-markup.sh` — the clock's markup subset: the default weight is
  plain (the shell theme's bold on `.button` must not reach the clock), bold
  widens the **size request** (measuring plain text would clip it), a colour span
  is accepted, and invalid markup falls back to the plain time instead of
  blanking the widget.
- `t-17-menu-size-stable.sh` — the gnome-menu popup asks for the same size for
  every category and fits the monitor work area; a popup that grew with the
  selection moved its own rows out from under the pointer and shook.
- `t-18-break-timer-reminders.sh` — the break reminders: the focus-free warning
  (no grab, no key focus), the modal break screen that takes input and resets
  the timer when served, postpone keeping the break owed, skip starting the
  interval over, a suppressed break screen degrading to the message, a session
  inhibitor or a manual pause silencing both stages while the counters run on,
  the warning yielding exactly once when the pointer reaches it, and the
  right-click menu building (`@tag:widget-break-timer`).
- `t-19-caffeine-duration.sh` — caffeine's timed keep-awake: the right-click
  menu of durations, the deadline and auto-off timer a duration arms, and
  turning it off clearing both (`@tag:widget-caffeine`).
- [`feature-debug.stub.sh`](feature-debug.stub.sh) — copy-paste boilerplate for
  throwaway feature-debug scripts (`local-*` copies are gitignored).
- [`png-stats.js`](png-stats.js) — PNG pixel statistics (screenshot smoke +
  local golden comparisons).

## Directories

- [`driver/`](driver/gwp-test-driver@gwp.test/extension.js) — test-only GNOME
  Shell extension exporting `org.gwp.TestDriver.Eval` on the test session bus
  (replaces the removed `org.gnome.Shell.Eval`). Never enable it in a real
  session.
