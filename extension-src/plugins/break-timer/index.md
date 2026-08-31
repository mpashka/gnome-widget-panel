# break-timer widget

`@tag:widget-break-timer`

Back to [plugins index](../index.md). User-visible behaviour:
[`../../../docs/specification/break-timer.md`](../../../docs/specification/break-timer.md).

## Purpose

Workrave-style rest reminders: three fixed, independently configurable
timers — **micro** break, **rest** break and a **daily** activity limit —
each drawn as a horizontal progress bar, each able to warn and then interrupt.
Unlike a wall-clock countdown, every timer counts only *activity* time: seconds
during which the user was recently moving the mouse or typing. Stepping away
from the keyboard pauses all timers; a long-enough pause counts as having taken
the break and resets the relevant timer(s).

## Structure

The widget is split so that the rules can be tested without a Shell:

- **`breakTimerState.ts` — gi-free rules.** Timer normalization, the
  activity/idle bookkeeping, the reminder state machine and the
  serialise/restore decisions. Pure functions over a plain state object
  (`{elapsed, reminder, quietUntil}`); `advance()` returns the next state and
  never mutates its argument. Covered by
  [`../../../tests/breakTimerState.test.mjs`](../../../tests/breakTimerState.test.mjs).
- **`breakTimerGraph.ts` — the Shell-facing widget.** Idle polling, the
  once-a-second tick, suppression checks, persistence cadence, Cairo drawing and
  the hover tooltip.
- **`breakTimerReminder.ts` — the two on-screen stages.** The chrome message and
  the modal break screen.
- **`breakTimerStore.ts` — async persistence.** Load/save of the counters and
  the boot id.

## Activity tracking and break detection

A single `GLib.timeout_add_seconds` tick runs every second while the widget
is alive and feeds `advance()`:

- **Idle time** comes from `global.backend.get_core_idle_monitor()` (a
  `Meta.IdleMonitor`), read fresh on every tick via `get_idletime()`
  (milliseconds since the last keyboard/mouse input). The monitor is probed
  once at construction inside a `try`/`catch`; if the call throws or does not
  return a number, the widget falls back to treating every tick as "active"
  (`idleMs = 0`) rather than throwing out of `create()`. In that fallback mode
  the micro/rest timers behave as plain accumulating counters: without idle
  information there is no way to detect that a break was taken, so they never
  auto-reset.
- **Active tick:** when idle time is below 5 s, every *enabled* timer's
  elapsed-activity counter is incremented by 1 s. Nothing accumulates while a
  break screen is up.
- **Break detection:** each enabled timer (except `daily`, whose
  `breakSeconds` is 0) compares the *current continuous idle time* against its
  own `breakSeconds`. Once continuous idle reaches that length, the timer's
  elapsed counter resets to 0 — i.e. taking the break resets it. Because idle
  time is a single shared clock, a long enough idle period resets every timer
  whose `breakSeconds` it has reached; a rest-length idle (8 min by default) is
  also well past the micro timer's 30 s, so it resets both. A break served in
  full on the break screen resets the same set.
- **Daily reset:** the daily counter has no idle break. It resets when the boot
  id changes (the machine was switched on again) or after a continuous idle of
  `dailyResetHours` (default 6 h).

## Reminders

### Silence: the pause and the session inhibitor

`advance()` starts no reminder and drops the one on screen while `isSilent()`
holds — either `state.pausedUntil` (wall-clock, set by `pauseReminders()` from
the context menu, cleared by `resumeReminders()` or by its own expiry) or the
`inhibited` input. The counters keep growing regardless, so the break is offered
on the first tick after the silence ends. `inhibited` comes from the same
`IsInhibited(4)` D-Bus call as before, but it is now polled on every tick (at
most every `INHIBIT_REFRESH_SECONDS`, 10 s) rather than only while a reminder is
up, because it decides whether the timers may speak at all. `_canInterrupt()`
therefore no longer looks at it: that predicate is now only about the *break
screen* (fullscreen, locked), which still degrades to the message.

The right-click `PopupMenu` on the graph (`_openMenu`, rebuilt on every open)
carries Postpone/Skip for the current reminder and the pause durations
(`PAUSE_CHOICES`) or Resume. While silent the bars are drawn at
`SILENT_BAR_ALPHA` and the tooltip gains a status line.

### Stages

`advance()` keeps at most one reminder — `{timer, stage, remaining, total}` —
and `breakTimerGraph` renders whatever it holds through `BreakReminderUi.sync()`,
so the UI is a function of the state rather than a pile of events:

- `prelude` — the advance warning, `leadSeconds` long (default: half the break,
  clamped to 5–30 s).
- `break` — the modal break screen, `breakSeconds` long. Completing it resets
  the timer and every shorter one.
- `due` — the message alone, 30 s, used by `notify` mode, by the daily limit and
  whenever the break screen is suppressed. When it expires the timer goes quiet
  for a while (`quietUntil`, in *activity* seconds): 5 min normally, 1 h for the
  daily limit, 1 min when a break screen was suppressed and should be retried.

`Postpone` sets `quietUntil` without resetting the counter; `Skip` resets that
one timer. A break screen is only opened while `_canInterrupt()` holds: not
locked (`Main.sessionMode.isLocked`), no monitor in fullscreen
(`global.display.get_monitor_in_fullscreen`), and nothing holding a session idle
inhibitor (async `org.gnome.SessionManager.IsInhibited(4)`, refreshed at most
every 30 s while a reminder is on screen — the same signal the
[caffeine](../caffeine/index.md) widget raises).

The message **yields once per showing**: it is reactive, and on `enter-event` it
eases (150 ms) to the anchor furthest from `global.get_pointer()`, then sets
`_yielded` and stays. Anchors are the six `MESSAGE_ANCHORS` positions on the
primary monitor (`normalizeAnchor(options.messageAnchor)`, default `top-right`);
`_placeMessage()` re-applies the current anchor as the countdown text changes
width, unless a flight is in progress (`_yielding`) or the user dragged it
(`_dragged`). Dragging is press/motion/release on the actor itself — Clutter's
implicit pointer grab keeps the motion events coming, and no modal is taken,
because this message must never hold the keyboard. (`Clutter.DragAction` does
not exist in this Shell.)

`BreakReminderUi` creates its actors on first use. The message is chrome
(`Main.layoutManager.addChrome(actor, {trackFullscreen: true})` — Shell 50
accepts only `trackFullscreen`/`affectsStruts` there, anything else throws) so it
never takes keyboard focus. The break screen is a stage-sized `St.Widget` in
`Main.layoutManager.modalDialogGroup` with `Main.pushModal(…,
{actionMode: Shell.ActionMode.SYSTEM_MODAL})`; `popModal` restores the window
focus that pushModal saved.

## Persistence

`breakTimerStore.ts` writes `{schema, bootId, savedAt, elapsed}` to
`$XDG_STATE_HOME/gnome-widget-panel/break-timer.json` every 30 s and on
`destroy()` (fire-and-forget — `destroy()` cannot await), all through async Gio.
`restoreElapsed()` decides what survives: the daily counter only within the same
boot and a gap shorter than `dailyResetHours`, micro/rest only when the gap is
shorter than their own break (a longer gap *is* a break). The boot id comes from
`/proc/sys/kernel/random/boot_id`; if it cannot be read, a value that matches
nothing is used, so the daily counter starts over.

## Rendering

An `St.DrawingArea` (`break-timer-graph`, default width 32 × height 16, like
`cpu-load-monitor`) draws one horizontal bar per *enabled* timer, stacked
vertically with an even height split and a 1px gap between bars. Each bar
has a faint track (theme foreground at low alpha) behind it; the fill width
is `min(1, elapsed/limit)` of the bar in the timer's `color`. Once
`elapsed >= limit` ("overdue") the bar is drawn full-width in the timer's
`overdueColor` instead. Repaints every tick. The reminder actors are styled in
[`../../stylesheet.css`](../../stylesheet.css) (`.break-timer-message`,
`.break-timer-screen*`).

## Options

The widget reads per-widget `options` from the `widgets` GSettings key:

- `timers` — fixed-order array of three entries (`micro`, `rest`, `daily`), each
  `{name, enabled, workMinutes, breakSeconds, color, overdueColor, reminder,
  leadSeconds, allowPostpone, postponeMinutes, allowSkip}`. Name, count and
  order are fixed; the other fields are defensively normalized (invalid/missing
  values fall back per-field to the default below), mirroring
  `cpu-load-monitor`'s `normalizeBands`. `reminder` is `off` / `notify` /
  `screen`; `leadSeconds: 0` derives the warning length from the break.
  Defaults:
  - `micro`: enabled, 10 min work / 30 s break, `screen`, postpone 2 min, skip
    allowed, `#4ca6ff` / overdue `#f03333`.
  - `rest`: enabled, 60 min work / 480 s (8 min) break, `screen`, postpone
    5 min, skip allowed, `#3dc752` / overdue `#f03333`.
  - `daily`: enabled, 480 min (8 h) work, `breakSeconds: 0` (no idle-based
    reset), `notify`, no postpone/skip, `#ffb82e` / overdue `#f03333`.
- `dailyResetHours` — hours of continuous idle that end the working day
  (default 6, 0 disables the rule; a reboot always ends it).
- `messageAnchor` — where the advance warning starts: one of `top-left`,
  `top-center`, `top-right` (default), `bottom-left`, `bottom-center`,
  `bottom-right`.
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
- `breakTimerState.ts` — gi-free rules: normalization (timers and the message
  anchor), `advance()`, `isSilent()`, pause/resume, postpone/skip,
  serialise/restore.
- `breakTimerGraph.ts` — `St.DrawingArea`: idle polling, the inhibitor poll,
  suppression checks, the right-click menu, persistence cadence, Cairo drawing
  and the hover tooltip.
- `breakTimerReminder.ts` — the chrome message (anchors, yield-once, dragging)
  and the modal break screen.
- `breakTimerStore.ts` — async load/save of the counters and the boot id.
- `prefs.ts` — widget settings UI: a row per timer (summary subtitle, enable
  switch, settings button pushing that timer's own subpage with the
  work-interval/break-duration `Adw.SpinRow`s, the reminder `Adw.ComboRow` with
  its lead/postpone/skip rows and two `Gtk.ColorDialogButton`s), the
  daily-reset, warning-position and width rows, and the tooltip
  show-switch/template editor with live preview. See
  [`../../../docs/implementation/preferences.md`](../../../docs/implementation/preferences.md).

Not added to the default widget config; add it manually from preferences.

## Related docs

- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)
