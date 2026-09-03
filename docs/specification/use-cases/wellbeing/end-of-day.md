# "Tell me when the working day is over"

`@tag:use-case` `@tag:widget-break-timer`

Back to [wellbeing](index.md) · [use cases](../index.md).

**Goal.** I stop when the work runs out, which is never. I want the panel to
tell me that I have had a day's worth — either by hours worked or by the clock.

## Also assumes

The **Break timer** widget with its **daily** timer enabled
([`regular-breaks.md`](regular-breaks.md)).

## Steps

1. **Watch the daily bar** (amber by default). It fills with the hours you have
   actually spent at the keyboard — 8 h by default — and turns red when the limit
   is up.
2. At the limit, a message says so: `Daily limit reached — call it a day`.
   Nothing dims and nothing is enforced — there is no useful way to enforce the
   end of a day — and while the limit stands the message returns at most once an
   hour of work.
3. [S4](../steps.md#s4) at any point for `daily: elapsed/limit`.

**Cost.** Zero gestures; the decision stays yours.

## Variants

- **I care about the hour, not the hours.** Switch on **end of the working day**
  (off by default, 21:30) on the daily timer's page: the bar then shows whichever
  comes first — the hours worked or the hour itself. Two people mean different
  things by "the end of the day", so the widget does not pick one for you.
- **8 hours at the keyboard is not 8 hours of wall clock.** Correct, and
  deliberate: idle seconds are not counted, so the daily limit measures a real
  day's work spread over a longer, more irregular stretch.
- **When does it start again?** Switching the computer on always starts a new
  day, and so does a long absence — **end the day after** hours away from the
  keyboard, 6 h by default, 0 to disable. Nothing else resets it: not a micro
  break, not a rest break, not dismissing the message, not restarting GNOME
  Shell. The reasoning, and the parts still under review, are in
  [`../../break-timer.md`](../../break-timer.md).
- **Work that runs past midnight.** Still the same working day — the counter has
  no wall-clock boundary, because a counter that emptied at 00:00 would excuse
  exactly the session that most needs the warning.
- **A lunch break is not the end of the day.** Which is why the daily counter
  ignores the idle rule the other timers use.

## Result

A bar you can read at a glance and a message when the day is up. The counter is
[persisted](../steps.md#r2) along with the boot it belongs to, so a shell
restart or a crash does not hand you a fresh working day.
