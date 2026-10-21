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
  (`{elapsed, reminder, quietUntil, …, absence}`); `advance()` returns the next state and
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
  `breakSeconds` is 0) compares the *time away* against its own
  `breakSeconds`: the current continuous idle reading, or across a suspend
  (`input.sleptSeconds`, no tick ran) the idle before it plus the time asleep,
  whichever is longer (`awaySeconds()`). Time behind the lock screen is
  credited on restore (below), since the panel does not exist while locked. Once continuous idle reaches that length, the timer's
  elapsed counter resets to 0 — i.e. taking the break resets it. Because idle
  time is a single shared clock, a long enough idle period resets every timer
  whose `breakSeconds` it has reached; a rest-length idle (8 min by default) is
  also well past the micro timer's 30 s, so it resets both. A break served in
  full on the break screen resets the same set.
- **Daily reset:** the daily counter has no idle break. It resets when the boot
  id changes (the machine was switched on again), after a long absence of
  `dailyResetHours` (default 6 h), or from the menu's *Start a new day*
  (`startNewDay()`). The graph writes one journal line per actual reset with
  its reason (`break-timer: a new working day — …`). The reason comes from the
  rules: every transition sets `state.dayReset` (`absence`, `manual`, or
  `break` when a daily `breakSeconds` is configured), only when a day had
  begun; the boot reset comes from `restoreDay().reset`.

### The long absence across sporadic input (gwp-344)

A machine left on overnight sees a key or the mouse now and then, and each
touch zeroes Mutter's idle time; a rule that wanted one continuous idle of
`dailyResetHours` never fired, and the counter stayed red for days.
`trackAbsence()` (in `advance()`) keeps `state.absence`
(`{idleSeconds, lastIdleSeconds, burstSeconds, burstStartedAt, away,
heldSeconds}`) instead:

- an idle stretch of at least `ABSENCE_STRETCH_SECONDS` (20 min) counts in
  full — on its first tick the whole reading, afterwards what it grew by since
  the last tick (`lastIdleSeconds`). Shorter idle never counts: twenty minutes
  is well above the 5-minute burst cap, so a day with a key pressed every
  5–20 minutes (a training video) is not an absence;
- a suspend counts the same way: the graph passes the wall-clock gap since the
  previous tick as `input.sleptSeconds`; an idle reading that also grew through
  the suspend is re-based (`lastIdleSeconds = idle`) so it is not counted twice;
- after a stretch ends, `burstSeconds` counts the ticks while the idle reading
  is under 5 min; when it reaches 5 min the ticks of that gap come off again,
  so a gap of 5–20 min neither counts towards the absence nor extends the burst
  (two night touches eight minutes apart are two bursts). `burstSeconds −
  idleSeconds` is then the burst's input span up to the latest input. Over `ABSENCE_BURST_SECONDS` (5 min) it is a return to work and
  the count drops to 0; up to that, the next stretch adds on;
- while `away` (a stretch counted, no return yet) the daily activity of a burst
  is held in `heldSeconds` instead of `elapsed.daily`, and `dayStartedAt` is not
  set: a stray touch at 23:30 must not make that the day's start, or the next
  morning's deadline is yesterday's. A return releases the held seconds and
  sets `dayStartedAt` to `burstStartedAt`; a short burst's held seconds are
  dropped by the next stretch;
- when the count reaches `dailyIdleResetSeconds` the daily timer resets and the
  count goes back to 0, so the reset fires once rather than on every tick of
  the rest of the night (which would also eat the first minutes of the morning).

The absence count and `away` are stored with the day fields
(`absenceIdleSeconds`, `absenceAway`) and restored by `restoreDay()` under the
same rule, with the gap since the save added when it is itself a stretch (and a
stored count that the gap completes ends the day, `reset: 'absence'`); so a
rebuild in the night does not start the count over. The graph also makes its
state with the current idle reading (`createState(idleSeconds)` seeds
`absence.lastIdleSeconds`), so a stretch already running when it is rebuilt is
counted from there on, not again from its start.

The graph's `_localDay()` caches the local-date numbers (`_dayEndOn()`,
`_calendar()`) per date, so the once-a-second tick builds `GLib.DateTime`
objects only when the date changes.

### The daily limit's second threshold: the end of the working day

The daily limit answers to **two** thresholds and the bar draws whichever is
further along:

- the **work done** — `elapsed.daily` against `workMinutes`, as before;
- the **time of day** — `dayEndMinutes` (default 21:30), off unless
  `dayEndEnabled` is set. Some hours are simply not working hours, and no amount
  of "but I only worked three hours today" changes that.

The rules stay timezone-free: `breakTimerGraph.ts` computes the deadline as an
epoch second (`_dayEndAt()`, via `GLib.DateTime`) and passes it into `advance()`
as `input.dayEndAt` (0 = switched off), so `breakTimerState.ts` only does
arithmetic and the unit tests need no clock. The deadline is anchored to the day
the work **began** on (`state.dayStartedAt`, the first activity after the daily
counter last reset), not to today: past midnight the deadline that matters is
still the one of the day one sat down on, by then already behind. The graph
asks `dayAnchor()` for that day, which puts an explicit `state.dayAnchorAt`
first. A new day started after today's deadline — by `startNewDay()` or by the
long-absence reset — sets it to tomorrow's local noon (`nextDayAnchor()`, from
`input.todayDayEndAt` and `input.tomorrowAt`, which the graph's `_calendar()`
computes with `GLib.DateTime`, so it is the next date whatever the day end and
DST), and tonight's window does not come straight back. Before the deadline it
is 0; every daily reset rewrites it, and it is persisted and restored with the
rest of the day (`restoreDay()`). A `day-end` reminder on screen is dropped by
`advance()` as soon as `isDayOver()` no longer holds (a new day, the limit
switched off or moved later).

`isDayOver()` makes the daily timer due even with hours left on its counter, and
the reminder carries `reason: 'day-end'` so its message says "The working day is
over — stop for today" rather than claiming a limit was reached.

**Past the deadline the window is the only daily reminder.** `isOffered()`
answers for the daily timer with `isDayEndDue()` alone once `isDayOver()` holds:
no `limit` message while the window is up, postponed or waiting for a free
screen, and its return after a postponement follows `dayEndSnoozedUntil` (wall
clock), not `quietUntil` (activity seconds). `advance()` also drops a `limit`
message that is still up when the deadline passes. Before gwp-344 the two
triggers competed: with the counter past its limit, postponing the window let
the next tick raise the 30-second limit message, which inherited the window's
split button (below), and its expiry set `quietUntil` an hour of *activity*
ahead — so the window did not come back when its postponement ended.
`dayEndFraction()` fills the bar from `dayStartedAt` to the deadline; before the
first activity of the day there is nothing to measure from, so it stays empty.

#### The window that does not expire (#45)

A `day-end` reminder is built with `remaining: 0`, and `advanceReminder()`
returns early for it: it is the one reminder with no countdown, because the end
of the day is the one threshold no amount of idling satisfies. Everything that
follows hangs off that:

- **`state.dayEndSnoozedUntil`** (wall-clock epoch seconds) is the only answer.
  `postponeDayEnd(state, until)` sets it; `isDayEndSnoozed()` gates
  `isDayEndDue()`. Wall-clock rather than the activity seconds `quietUntil`
  counts in — ten minutes away from the keyboard must still be ten minutes.
  `resetTimer('daily')` clears it: a new working day forgets last night.
- **It never writes the configured end of day.** `dayEndAt` is an input computed
  by the graph from the setting; nothing in the postpone path touches it.
- **Suppression is not an answer.** `isDayEndDue()` requires `input.canInterrupt`,
  and `advance()` drops a `day-end` reminder already on screen when that goes
  false, leaving `dayEndSnoozedUntil` alone — so it returns by itself. The
  hourly `quietUntil` does not apply while the window is only waiting for a free
  screen: it was never shown, so there is nothing to be quiet about.
- **The UI half** (`breakTimerReminder.ts`) marks the showing
  `_messagePersistent`, which is part of the action-row cache key
  (`_syncMessageActions()`, cleared on hide) — a `limit` message and the window
  are both `daily:due`, and a key without the kind kept the split button on the
  wrong one. The flag changes two more things: `_canYield()` returns false —
  the window **never steps aside** — and `_syncMessageDetails()` renders the
  day's numbers, which the graph works out in `_dayEndDetails()`. Its answer is
  on it from the first moment, by the ordinary `due`-stage rule.

  It used to do the opposite: no buttons until it had yielded, and one
  step-aside re-armed on every `leave-event` so it could move again later. That
  read well and was unusable — **the yield moves the window out from under the
  pointer, so `leave` fires at once and re-arms it.** Every approach was a first
  approach: the window fled across the screen forever and its buttons could
  never be clicked. A question that stands until it is answered must not run
  from the answer; what keeps it off the work underneath is dragging, and being
  answered.
- **The answer is a split button** built by `_fillDayEndActions()`:
  `DAY_END_WRAP_UP_SECONDS` (10 min, fixed) plus a chevron opening
  `_openPostponeMenu()` — `DAY_END_POSTPONE_MINUTES`, two `_addStepperItem()`
  rows (a free length via `stepDuration`, a time of day in quarter-hours) and
  the route into preferences, which is the only place the habitual time changes.

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

**A pause is also a keep-awake.** Nobody pauses their rest reminders for a
meeting and then wants the screen to lock mid-sentence, so `_pause()` takes a
session inhibitor (`SessionInhibitor` from
[`../../sessionInhibitor.ts`](../../sessionInhibitor.ts), `@tag:session-inhibitor`
— the same plumbing the [caffeine](../caffeine/index.md) widget uses) and holds
it for exactly as long as the pause lasts. It is released by `_resume()`, by the
pause running out (checked on the tick right after `advance()`) and by
`destroy()`. Releasing also clears the cached `inhibited` answer and forces a
re-poll: that answer is up to 10 s old and would otherwise still report our own
just-released inhibitor, keeping the timers silent after the user resumed them.

**While paused the widget draws a different face:** a Cairo coffee cup and one
bar counting the pause down (`pauseFraction()`), instead of the three timer bars
whose numbers nobody is watching during a meeting. `pausedFrom` is stored beside
`pausedUntil` so the bar survives a shell restart; a state file from before that
field simply draws a full bar.

The right-click `PopupMenu` on the graph (`_openMenu`, rebuilt on every open)
carries Postpone/Skip for the current reminder, the pause durations
(`pauseMinutes`) or Resume, and — always, last, below a separator — *Start a
new day* (`_startNewDay()` → `startNewDay()`). While silent the bars are drawn at
`SILENT_BAR_ALPHA` and the tooltip gains a status line.

### Stages

`advance()` keeps at most one reminder — `{timer, stage, remaining, total}` —
and `breakTimerGraph` renders whatever it holds through `BreakReminderUi.sync()`,
so the UI is a function of the state rather than a pile of events:

- `prelude` — the advance warning, `leadSeconds` long (default: half the break,
  clamped to 5–30 s).

  Before anything is offered, `isCoveredByLongerBreak()` settles a break that
  a longer one will cover shortly: if another enabled, not-`off` break timer
  (never `daily`) with a longer break is due in less than
  `COVERED_BY_LONGER_BREAK_FRACTION` (2/3) of this timer's interval — or owed
  and offered now, i.e. not deferred by `quietUntil` (postponed, message
  expired, screen suppressed) — this timer is reset silently
  (`resetTimer`, as if taken). In practice: no micro break within 6:40 of the
  rest break. Taking the rest break resets the micro timer anyway
  (`completeBreak`, and the idle rule).
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

The **transient** message **yields once per showing**: it is reactive, and on
`enter-event` it
eases (150 ms) to the anchor furthest from `global.get_pointer()`, then sets
`_yielded` and stays. The yield is also what **unlocks the warning's buttons**:
`_messageOffersActions()` is false for the `prelude` stage until `_yielded`, so
the advance warning is a bare hint until it has moved and grows Postpone/Skip
when the flight ends (`_syncMessageActions()` in the ease's `onComplete`, after
which `_placeMessage()` re-anchors the now taller box). The `due` message offers
them from the start — there the break is already owed. Anchors are the six `MESSAGE_ANCHORS` positions on the
primary monitor (`normalizeAnchor(options.messageAnchor)`, default `top-right`);
`_placeMessage()` re-applies the current anchor as the countdown text changes
width, unless a flight is in progress (`_yielding`) or the user dragged it
(`_dragged`). Dragging is press/motion/release on the actor itself — Clutter's
implicit pointer grab keeps the motion events coming, and no modal is taken,
because this message must never hold the keyboard. (`Clutter.DragAction` does
not exist in this Shell.)

Those drag handlers sit on the **ancestor of the Postpone/Skip buttons**, which
constrains them twice:

- **The press must never be consumed.** In Shell 50 `St.Button` recognises its
  click with a `ClutterClickGesture`, and any ancestor answering `EVENT_STOP`
  for the same press cancels that gesture — a drag handler that swallowed the
  press left both buttons dead to the mouse while every direct
  `_actions.onSkip()` call still worked. `_onDragPress` and `_onDragRelease`
  therefore return `EVENT_PROPAGATE`; only a motion during an actual drag is
  consumed.
- **A press on the buttons must not start a drag.** Which press that is comes
  from the pointer coordinates against `_messageActions` (`isInside`), not from
  `event.get_source()` — that is `null` for events an input device injects, and
  `contains(null)` throws.

`t-18` covers both with a virtual pointer: a call to `_actions.onSkip()` goes
nowhere near the gesture and would pass over either bug.

`BreakReminderUi` creates its actors on first use. The message is chrome
(`Main.layoutManager.addChrome(actor, {trackFullscreen: true})` — Shell 50
accepts only `trackFullscreen`/`affectsStruts` there, anything else throws) so it
never takes keyboard focus. The break screen is a stage-sized `St.Widget` in
`Main.layoutManager.modalDialogGroup` with `Main.pushModal(…,
{actionMode: Shell.ActionMode.SYSTEM_MODAL})`; `popModal` restores the window
focus that pushModal saved.

## Persistence

`breakTimerStore.ts` writes `{schema, bootId, savedAt, elapsed, dayStartedAt,
dayEndSnoozedUntil, dayAnchorAt, absenceIdleSeconds, absenceAway}` to
`$XDG_STATE_HOME/gnome-widget-panel/break-timer.json` every 30 s and on
`destroy()` (fire-and-forget — `destroy()` cannot await), all through async Gio.
`restoreElapsed()` decides what survives: the daily counter only within the same
boot and short of the long-absence reset, micro/rest only when the time away is
shorter than their own break (a longer absence *is* a break). The time away is
the gap since `savedAt` **plus the stored `idleSeconds`** — the idle reading at
the save. The panel is destroyed on lock (`extension.ts`
`_syncPanelWithSession`) and saves then, minutes into the absence; counting the
gap alone left the rest timer owed after eleven minutes away (gwp-344 round 2). The boot id comes from
`/proc/sys/kernel/random/boot_id`; if it cannot be read, a value that matches
nothing is used, so the daily counter starts over.

`restoreDay()` brings back `dayStartedAt`, `dayEndSnoozedUntil` and
`dayAnchorAt` under the
daily counter's rule — so a plugin rebuild (any `widgets` key write) neither
re-raises an answered end-of-day window nor forgets the evening — and reports
why a stored day that had begun was dropped (`reset: 'boot' | 'absence'`). The
A day that `restoreDay()` finds ended gets its anchor by the same
`nextDayAnchor()` rule as a reset seen by the tick (the graph passes its
`_calendar()` in the restore context): the panel is rebuilt on every unlock, so
a locked night is restored, not ticked — unlocked after today's day end, the new
day is tomorrow's.

The day and absence fields were added without a schema bump: a file without
them loads them as 0, and an older build ignores them. The restored day start wins over one the
first ticks may already have set, being earlier.

## Rendering

An `St.DrawingArea` (`break-timer-graph`, default width 32 × height 16, like
`cpu-load-monitor`) draws one horizontal bar per *enabled* timer, stacked
vertically with an even height split and a 1px gap between bars. Each bar
has a faint track (theme foreground at low alpha) behind it; the fill width
is `min(1, elapsed/limit)` of the bar in the timer's `color`. Once
`elapsed >= limit` ("overdue") the bar is drawn full-width in the timer's
`overdueColor` instead.

The tick runs every second because the state must, but the **bars are repainted
only when they would come out different**: `_paintSignature()` boils the drawing
down to the box size, the silent flag and each bar's overdue flag plus its width
in whole pixels, `_draw()` records what it drew, and the tick compares. A 32 px
bar for a 10-minute timer moves one pixel per ~19 s, so this is the difference
between one repaint a second and one every twenty
([CPU cost](../../../docs/testing/cpu-cost.md)). Callers that change something
the signature does not carry — colours, orientation, the template — still call
`queue_repaint()` directly.

The reminder actors are styled in
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
- `dailyResetHours` — hours away from the keyboard that end the working day,
  counted across bursts of input up to 5 min (default 6, 0 disables the rule; a
  reboot always ends it).
- `dayEndEnabled` / `dayEndMinutes` — the daily limit's second threshold: stop
  working at a time of day, as minutes since local midnight. Default **off**,
  21:30 (`DEFAULT_DAY_END_MINUTES`). See "The daily limit's second threshold"
  above.
- `pauseMinutes` — the three lengths the context menu offers, in minutes
  (default `[30, 60, 90]`). Normalized to exactly three sorted values inside
  1 min … 8 h; anything missing falls back to its default.
- `messageAnchor` — where the advance warning starts: one of `top-left`,
  `top-center`, `top-right` (default), `bottom-left`, `bottom-center`,
  `bottom-right`.
- `width` — graph width in pixels (default 32). Height is fixed at 16;
  tick interval is fixed at 1 s (not configurable).
- `showTooltip` — set `false` to disable the hover tooltip (default `true`).
- `template` — hover-tooltip template string (default
  `{micro}\n{rest}\n{daily}\n{dayend}`). Tokens `{micro}`, `{rest}`, `{daily}`:
  each
  renders as a coloured Pango fragment `name: elapsed/limit` (e.g.
  `micro: 7:32/10:00`) in the timer's `color`, or in `overdueColor` with a
  trailing `— break!` once overdue. A *disabled* timer's token renders as an
  empty string, and a line left blank by an empty token is dropped altogether.
  `{dayend}` renders `until 21:30: 1:18:00 left` — with `— first` when the clock
  is the threshold the bar is drawing — or `day over (21:30) — stop`, and is
  empty while the end-of-day limit is switched off. Durations format as
  `M:SS`, switching to `H:MM:SS` once past an hour (used for the `daily`
  timer). Literal text is Pango-escaped and `\n` is a line break; see
  [`../../tooltipTemplate.ts`](../../tooltipTemplate.ts) (`@tag:ui`). Edited
  with a live preview in the settings page.

## Vertical panel rotation and tooltip

Implements `setPanelLayout({vertical, rotation})` exactly like
`cpu-load-monitor`'s `cpuGraph.ts`: in a vertical panel the graph swaps its
actor size (tall/narrow) and rotates the Cairo drawing 90° (`rotation`
`left`/`right` picks the direction) through the shared
[`panelRotation.ts`](../../panelRotation.ts).

**The drawing box comes from the surface, not from the size the graph asked
for.** The strip is 20px wide and CSS margins take their cut, so the allocation
can be narrower than the requested 16px thickness; drawing the requested size
into a smaller surface put the last of the three stacked bars past the edge and
left the yellow daily bar as a one-pixel sliver. The bars now scale to whatever
they are given, and the vertical `.break-timer-graph` margin swaps with the
orientation so the strip hands over its full thickness. Pinned by
[`t-23-vertical-strip.sh`](../../../tests/ui/index.md) and
[`tests/panelRotation.test.mjs`](../../../tests/index.md). The hover tooltip uses the
same flicker-free, in-place-update pattern (fade only on enter/leave) and is
placed to the side of the widget when the panel is vertical (whichever side
has more room), or above/below when horizontal.

## Source files

- `index.ts` — plugin entrypoint; passes widget `options` to the graph.
- `breakTimerState.ts` — gi-free rules: normalization (timers and the message
  anchor), `advance()` with the long-absence count, `isSilent()`,
  pause/resume, postpone/skip, `startNewDay()`, serialise/restore
  (`restoreElapsed()`, `restoreDay()`).
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
