# Break timer — timers, resets and rest reminders

`@tag:widget-break-timer`

Back to the [user guide](index.md) · [all widgets](widgets.md). Developer notes:
[`../../extension-src/plugins/break-timer/index.md`](../../extension-src/plugins/break-timer/index.md).

The **Break timer** widget (`break-timer`) is a Workrave-style rest reminder: it
measures how long you have actually been working — not how long the computer has
been switched on — and asks you to stop before you have been at it for too long.
This page is the user-facing contract for that behaviour: the three timers, when
each one resets, and the two-stage reminder (a passive warning first, a dimmed
break screen second).

Everything on this page is implemented. The daily counter's day boundary is the
part still under review — see [Resetting the daily
counter](#resetting-the-daily-counter).

## The three timers

Three timers run at once, each with its own work interval, break length and
colour, each drawn as its own horizontal bar. Their names, count and order are
fixed; every other field is configurable.

| Timer | Work interval | Break | Enabled by default | Colour |
| --- | --- | --- | --- | --- |
| **micro** — micro-break | 10 min | 30 s | yes | `#4ca6ff` |
| **rest** — rest break | 60 min | 8 min | yes | `#3dc752` |
| **daily** — daily limit | 8 h | — (see [Resetting the daily counter](#resetting-the-daily-counter)) | yes | `#ffb82e` |

A bar fills as its work interval is used up; once the interval is exhausted the
bar goes full width in the timer's overdue colour (`#f03333` by default) and
stays there until the timer resets. A disabled timer draws no bar at all, so
with the defaults above the widget shows **three** bars.

## What counts as work

Every timer counts **activity seconds**, not wall-clock seconds. Once a second,
the widget asks the session how long ago the last keyboard or mouse input was:

- Last input less than **5 seconds** ago → you are working: every enabled
  timer's counter grows by one second.
- Last input longer ago than that → the counters are frozen. Reading a page,
  sitting in a meeting or walking away all stop the clock; none of it counts as
  work, and none of it counts as a break either until the pause is long enough
  (below).

The daily limit therefore measures 8 hours *at the keyboard*, which is a longer
and more irregular stretch of wall-clock time.

## Resetting a timer

The rule is the same for the micro and rest timers, and it is the timer's own
break length that decides:

> A continuous idle period at least as long as the timer's configured break
> resets that timer's counter to zero.

That is the whole contract — the break was taken, so the interval starts again.
Three consequences worth stating explicitly:

- **A longer break also resets the shorter timers.** An 8-minute rest break is
  far longer than the 30-second micro break, so it resets both. You never owe a
  micro break immediately after a rest break.
- **A partial break resets nothing.** Twenty seconds away from a 30-second micro
  break leaves the counter frozen where it was, not reduced. Breaks do not
  accumulate from fragments.
- **An overdue timer follows the same rule.** A red bar does not clear itself
  because time passed or because you dismissed a reminder; it clears when you
  actually stay away for the break length.

The reset is driven purely by idle time, so it happens whether the break came
from a reminder, from lunch, or from an unrelated interruption. Nothing needs to
be pressed for a break to count.

## Resetting the daily counter

The daily limit needs its own rules, because the idle rule above is wrong for
it. Its "break" is the end of the working day, and a lunch break is *part of* a
working day — a counter that a one-hour lunch zeroes does not measure a day.

The daily counter resets when **either** of these happens:

1. **The computer is switched on.** The working day starts at boot: the counter
   is tied to the current boot, so a reboot begins a new day and a GNOME Shell
   restart within the same boot does not. No wall-clock boundary is involved —
   work that runs past midnight is the same working day, and a counter that
   emptied at 00:00 would excuse exactly the session that most needs the
   warning.
2. **A long absence ends.** A continuous idle period of at least *end the day
   after*, default **6 hours** (0 disables this rule). This covers a night's
   sleep on a machine that is never switched off, and it is long enough that no
   meal, meeting or errand can trigger it.

Nothing else resets it: not a micro break, not a rest break, not dismissing a
reminder, and not restarting GNOME Shell.

> **Provisional.** Tying the day to the boot is the simple reading of "the day
> starts when I switch the computer on", and it is deliberately the first
> version: a machine left on overnight leans entirely on rule 2, and a machine
> rebooted at lunchtime forgets the morning. Expect this rule to change once
> there is real experience with it; the two rules above are the part of this
> page most likely to move.

**The counters are persisted** to
`$XDG_STATE_HOME/gnome-widget-panel/break-timer.json` (usually
`~/.local/state/…`) every half minute and when the widget goes away. The daily
counter in particular is meaningless if a shell restart, a crash or a logout
wipes it, so the counters are stored along with the boot and the moment they
were last updated, and restored on start:

- The daily counter is restored when the store belongs to the current boot and
  the gap since the save is shorter than the long-absence rule; otherwise it
  starts at zero.
- The micro and rest counters are restored only when the gap between the stored
  timestamp and now is shorter than the timer's break length — a longer gap is
  itself a break, so those timers start at zero.

## The reminders

Reminders come in two stages. The first one warns; only the second one
interrupts. Both belong to the micro and rest timers; the daily limit has only
the first stage (see below).

### Stage 1 — the advance warning

Shortly before a break is due, a **passive on-screen message with a live
countdown** appears: `Rest break in 24 s`, ticking down every second.

- **It never takes focus and never grabs input.** It is a notification-style
  message, not a window: the focused window stays focused, keystrokes keep going
  where they were going, and nothing is raised over what you are doing. This is
  the whole point of the stage — you get to finish the sentence you are typing.
- **It steps aside once if you go near it.** The message sits on one of six
  anchors (top/bottom × left/centre/right, **top right** by default — the middle
  of the top edge belongs to the shell's own notifications). When the pointer
  reaches it, it flies in 150 ms to whichever anchor is furthest from the
  pointer, and then **stays there for the rest of that showing**. So the screen
  under it is free when you need to click what it was covering, and its own
  buttons stay clickable — a message that kept fleeing could never be pressed,
  and constant motion at the edge of your eye is precisely what a warning must
  not do to someone mid-sentence. It stays where it went: the pointer having
  arrived there is evidence that its old corner was in the way.
- **It can be dragged anywhere.** Press and drag it with the mouse; the place
  you drop it wins over the anchor from then on (until the panel restarts).
- If the message is somewhere unhelpful, the same actions live in the widget's
  own right-click menu (see [Pausing the timers](#pausing-the-timers)) — a
  target that never moves.
- **How early it appears** depends on the break length: half the break, clamped
  to between 5 and 30 seconds. With the defaults that is 15 s before a micro
  break and 30 s before a rest break. It is configurable per timer.
- **Going idle during the warning cancels it.** If you take the hint and stop,
  and the pause reaches the break length, the break has been taken: the message
  disappears, the timer resets and the break screen never comes.
- It carries the same **Postpone** / **Skip** buttons as the break screen, when
  those are allowed.
- **In `message only` mode the message is all there is.** It stays for half a
  minute saying the break is due, then goes quiet for five minutes of work
  before saying so again. Nothing dims and nothing is enforced.

### Stage 2 — the break screen

When the countdown reaches zero and you are still working, the screen **dims**
and a modal break screen appears on every monitor, showing which break it is and
the break time remaining, counting down.

- **It takes input, not focus.** The overlay swallows keyboard and pointer input
  so typing cannot leak into applications, but window focus is untouched: when
  the break ends the overlay disappears and the window you were in is still the
  window you are in.
- **The countdown runs on wall-clock time** and does not restart because you
  touched the mouse. When it reaches zero the overlay closes and the timer
  resets.
- **Escape hatches**, each of which can be turned off per timer:
  - **Postpone** — the break is offered again a few minutes later (default 2 min
    for micro, 5 min for rest). The counter is *not* reset; you still owe the
    break.
  - **Skip** — this break does not happen. The counter *is* reset and the next
    work interval starts. Only *that* timer's counter: a skipped rest break does
    not settle the micro break the way a taken one does, so a micro break may
    follow it shortly.
  - `Esc` postpones when postponing is allowed, and does nothing otherwise.
  - With both turned off the break screen can only be waited out. This is
    deliberate ("strict mode") and is off by default.
- **It stays out of the way when interrupting would be harmful.** A fullscreen
  application, an active screen recording or screen share, or a locked session
  suppress the break screen; the break degrades to the stage-1 message and is
  offered again after a minute of further work, so it arrives as soon as the
  film or the presentation is over. Something *keeping the session awake* is
  stronger still and silences both stages — see below.

### The daily limit

The daily limit gets stage 1 only: reaching it shows the message
(`Daily limit reached — call it a day`) and the bar turns red, and that is all.
There is no dimmed screen and no countdown, because there is no break length to
count down and no useful way to enforce the end of a working day. While the
limit stands the message returns at most once an hour of work.

## Pausing the timers

Some hours are not the moment to be told to rest: a meeting, a presentation, a
call in which nothing is typed and nothing may cover the screen. Two gestures
cover that, and they mean the same thing to this widget — **stay silent, keep
counting**. The counters never stop, because a meeting tires the eyes too; the
break is simply owed the moment the quiet ends, which is a good time to stand up
anyway.

**Right-click the widget** for its menu:

- **Postpone** / **Skip** the reminder that is currently up, when that timer
  allows them. The panel button is a target that never moves, unlike the
  message.
- **Pause for 30 minutes · 1 hour · 1:30** (all three lengths are settings).
  Every pause expires by itself —
  a pause you can forget to end is a timer you have switched off by accident.
  **A pause keeps the screen awake as well**, for exactly as long as it lasts:
  the meeting a pause covers is the same meeting a lock screen would interrupt.
  It is the [Caffeine](widgets.md) gesture from the other end, so either widget
  alone covers a call — pause the timers here, or switch Caffeine on there.
- **Resume**, which also shows how much of the pause is left. Resuming hands the
  screen back at the same moment.

**Anything keeping the session awake** silences the timers for as long as it
lasts — a screen-share inhibitor, a media player, and in particular the panel's
own [Caffeine](widgets.md) widget, whose right-click menu offers the same
15 min / 30 min / 1 h / 2 h durations. One click before a meeting therefore
covers both halves of it: the screen stays on and the timers stay quiet. Nothing
is shown until the inhibitor goes away — not the break screen, and not the
message either, which is the point when the screen is being shared.

**While paused the widget shows a coffee cup** and a single bar counting the
pause down, instead of three timer bars whose numbers nobody is watching during
a meeting. Silenced by something else — an inhibitor that is not ours — the
timer bars stay, only **dimmed**. Either way the hover tooltip says why
(`Paused — 42:10 left, screen kept awake`, or `Silent — the screen is kept
awake`).

The pause lives for the session: restarting GNOME Shell ends it, unlike the
counters, which are persisted.

## Settings

Per timer, on top of the existing enable switch, work interval, break length and
two colours:

- **Reminder** — `off` / `message only` / `message + break screen`
  (default `message + break screen` for micro and rest, `message only` for the
  daily limit).
- **Warn ahead by** — the stage-1 lead time in seconds (default: half the break,
  clamped to 5–30 s).
- **Allow postpone** / **Postpone by** — default on, 2 min for micro, 5 min for
  rest.
- **Allow skip** — default on.

The daily limit has no break length and no break screen, so it shows only the
enable switch, the work interval, the reminder mode (`off` / `message only`) and
its colours.

Each timer is a row in the settings page carrying its **summary**
(`10 min work · 30 s break · message + break screen`) and its enable switch, with
a settings button that opens that timer's own page — the same shape the panel's
widget list uses, so three timers can be compared without opening any of them.

Widget-wide, next to the unchanged graph width, tooltip on/off and tooltip
template (`{micro}`, `{rest}`, `{daily}`):

- **End the day after** — hours away from the keyboard that reset the daily
  counter, default 6 h, 0 to disable. Switching the computer on always starts a
  new day.
- **Warning position** — which of the six anchors the advance warning starts on,
  default **top right**. It still steps aside once per showing and can still be
  dragged.

## Non-goals

Deliberately out of scope for this widget: usage statistics and history, exercise
suggestions during a break, sounds, per-application exemptions, and syncing
counters between machines. Anyone who needs those wants Workrave itself.

---

Back to the [user guide](index.md) · [widgets catalog](widgets.md).
