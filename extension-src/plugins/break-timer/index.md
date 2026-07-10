# break-timer widget

`@tag:widget-break-timer`

Back to [plugins index](../index.md).

## Purpose

Workrave-style rest reminders: three fixed, independently configurable
timers — **micro** break, **rest** break and a **daily** activity limit —
each drawn as a horizontal progress bar. Unlike a wall-clock countdown, every
timer counts only *activity* time: seconds during which the user was
recently moving the mouse or typing. Stepping away from the keyboard pauses
all timers; a long-enough pause counts as having taken the break and resets
the relevant timer(s).

## Activity tracking and break detection

A single `GLib.timeout_add_seconds` tick runs every second while the widget
is alive:

- **Idle time** comes from `global.backend.get_core_idle_monitor()` (a
  `Meta.IdleMonitor`), read fresh on every tick via `get_idletime()`
  (milliseconds since the last keyboard/mouse input). The monitor is probed
  once at construction inside a `try`/`catch`; if the call throws or does not
  return a number, the widget falls back to treating every tick as "active"
  (`idleMs = 0`) rather than throwing out of `create()`. In that fallback mode
  the micro/rest timers behave as plain accumulating counters: without idle
  information there is no way to detect that a break was taken, so they never
  auto-reset (only the daily timer still resets, at local midnight).
- **Active tick:** when idle time is below 5 s, every *enabled* timer's
  elapsed-activity counter is incremented by 1 s.
- **Break detection:** each enabled timer (except `daily`, whose
  `breakSeconds` is 0 by default) compares the *current continuous idle time*
  against its own `breakSeconds`. Once continuous idle reaches that length,
  the timer's elapsed counter resets to 0 — i.e. taking the break resets it.
  Because idle time is a single shared clock, a long enough idle period
  resets every timer whose `breakSeconds` it has reached; a rest-length idle
  (8 min by default) is also well past the micro timer's 30 s, so it resets
  both.
- **Daily reset:** the daily timer's elapsed counter also resets whenever the
  local calendar day (`Date().toDateString()`) changes since the last tick,
  independent of idle time.
- **No persistence:** all counters live in memory only. A GNOME Shell
  restart (extension reload, logout, crash) resets every timer, including
  the daily counter, back to zero. Accepted as a v1 limitation.

## Rendering

An `St.DrawingArea` (`break-timer-graph`, default width 32 × height 16, like
`cpu-load-monitor`) draws one horizontal bar per *enabled* timer, stacked
vertically with an even height split and a 1px gap between bars. Each bar
has a faint track (theme foreground at low alpha) behind it; the fill width
is `min(1, elapsed/limit)` of the bar in the timer's `color`. Once
`elapsed >= limit` ("overdue") the bar is drawn full-width in the timer's
`overdueColor` instead. Repaints every tick.

## Options

The widget reads per-widget `options` from the `widgets` GSettings key:

- `timers` — fixed-order array of three entries (`micro`, `rest`, `daily`),
  each `{name, enabled, workMinutes, breakSeconds, color, overdueColor}`.
  Name, count and order are fixed; the other fields are defensively
  normalized (invalid/missing values fall back per-field to the default
  below), mirroring `cpu-load-monitor`'s `normalizeBands`. Defaults:
  - `micro`: enabled, 10 min work / 30 s break, `#4ca6ff` / overdue `#f03333`.
  - `rest`: enabled, 50 min work / 480 s (8 min) break, `#3dc752` / overdue
    `#f03333`.
  - `daily`: **disabled** by default, 360 min (6 h) work, `breakSeconds: 0`
    (no idle-based reset — only the midnight reset applies), `#ffb82e` /
    overdue `#f03333`.
- `width` — graph width in pixels (default 32). Height is fixed at 16;
  tick interval is fixed at 1 s (not configurable).
- `showTooltip` — set `false` to disable the hover tooltip (default `true`).
- `template` — hover-tooltip template string (default
  `{micro}\n{rest}\n{daily}`). Tokens `{micro}`, `{rest}`, `{daily}`: each
  renders as a coloured Pango fragment `name: elapsed/limit` (e.g.
  `micro: 7:32/10:00`) in the timer's `color`, or in `overdueColor` with a
  trailing `— break!` once overdue. A *disabled* timer's token renders as an
  empty string, so its template line collapses to blank. Durations format as
  `M:SS`, switching to `H:MM:SS` once past an hour (used for the `daily`
  timer). Literal text is Pango-escaped and `\n` is a line break; see
  [`../../tooltipTemplate.ts`](../../tooltipTemplate.ts) (`@tag:ui`). Edited
  with a live preview in the settings page.

## Vertical panel rotation and tooltip

Implements `setPanelLayout({vertical, rotation})` and `_applyRotation`
exactly like `cpu-load-monitor`'s `cpuGraph.ts`: in a vertical panel the
graph swaps its actor size (tall/narrow) and rotates the Cairo drawing 90°
(`rotation` `left`/`right` picks the direction). The hover tooltip uses the
same flicker-free, in-place-update pattern (fade only on enter/leave) and is
placed to the side of the widget when the panel is vertical (whichever side
has more room), or above/below when horizontal.

## Source files

- `index.ts` — plugin entrypoint; passes widget `options` to the graph.
- `breakTimerGraph.ts` — `St.DrawingArea` implementation: idle-monitor
  polling, activity/break/midnight reset logic, Cairo drawing and the hover
  tooltip.
- `prefs.ts` — widget settings UI: an `Adw.ExpanderRow` per timer (enable
  switch, work-interval and break-duration `Adw.SpinRow`s, two
  `Gtk.ColorDialogButton`s), a width row, and the tooltip
  show-switch/template editor with live preview. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).

Not added to the default widget config; add it manually from preferences.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
