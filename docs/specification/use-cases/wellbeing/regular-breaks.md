# "Make me stop before my wrists do"

`@tag:use-case` `@tag:widget-break-timer`

Back to [wellbeing](index.md) · [use cases](../index.md).

**Goal.** I lose hours without looking up. I want Workrave-style reminders —
short pauses often, a real break each hour, and a limit on the day — driven by
how long I have actually been working.

## Steps

1. [Add](../configure/add-widget.md) the **Break timer** widget. Three bars
   appear: **micro** (10 min work / 30 s break), **rest** (1 h / 8 min) and
   **daily** (8 h).
2. Work. Each bar fills with your **activity seconds**; going idle freezes them.
3. When a bar is due, the widget [reminds you](answer-reminder.md) — a passive
   warning first, then a dimmed break screen.
4. [S4](../steps.md#s4) any time to see each timer as `name: elapsed/limit`;
   an overdue one says `— break!`.

**Cost.** One-time setup; after that it costs nothing until it interrupts.

## Variants

- **The intervals do not fit my work.** Every timer has its own settings page —
  enable, work interval, break length, reminder mode, warning lead, whether
  postponing and skipping are allowed, colours. Durations are
  [typed the way you say them](../steps.md#s11).
- **I only want the micro breaks.** Switch the other timers off; a disabled
  timer drops its bar, so the widget shows only what it is counting.
- **A break I took without being told counts.** Resets are driven purely by idle
  time: a continuous pause at least as long as that timer's break resets it,
  whether it came from a reminder, from lunch, or from an interruption. Nothing
  needs to be pressed.
- **A partial break does not.** Twenty seconds of a thirty-second break leaves
  the counter where it was — breaks do not accumulate from fragments.
- **A long break also settles the short ones.** An 8-minute rest resets the
  micro timer too, so you never owe a micro break straight after a rest break.
- **Reminders without enforcement.** Set the reminder mode to *message only*:
  the message says the break is due, nothing dims.
- **Not for the next hour.** [`quiet-during-meeting.md`](quiet-during-meeting.md).

## Result

Three bars that measure work rather than uptime, and interrupt you before the
damage rather than after. They [survive a restart](../steps.md#r2); the exact
reset rules — including the daily counter's own — are in
[`../../break-timer.md`](../../break-timer.md).
