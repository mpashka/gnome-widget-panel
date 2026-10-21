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
3. **If you switched on the end of the working day**, that hour brings a window
   that **stays until you answer it**: the day's numbers (time at the keyboard,
   how much is past the limit, when you started) and one button — *Wrapping up —
   10 min*. There is no close button and `Escape` does nothing; the chevron
   beside the button offers longer answers, up to "work until 23:00".
4. [S4](../steps.md#s4) at any point for `daily: elapsed/limit`.

**Cost.** Zero gestures to be told; **one click** to answer — the only
interaction here you cannot skip.

## Variants

- **I care about the hour, not the hours.** Switch on **end of the working day**
  (off by default, 21:30) on the daily timer's page: the bar then shows whichever
  comes first — the hours worked or the hour itself. Two people mean different
  things by "the end of the day", so the widget does not pick one for you.
- **I need another hour tonight.** The chevron menu: 20 / 30 / 60 minutes, a
  length of your own with `±`, or a time to work until. It moves **tonight
  only** — your usual end of day is unchanged, and the menu's last item is where
  you change that on purpose.
- **It is covering something.** Drag it, or answer it. It does not step aside
  from the pointer — a question that stands until it is answered must not run
  from the answer.
- **I answered it and a second message appeared.** It does not any more: once
  the hour has come, the window is the only thing the daily limit says, and
  while it is put off nothing else takes its place.
- **I am presenting / recording / on a call.** It stays away entirely, and
  arrives when that is over — a window you cannot close must not appear on a
  shared screen.
- **Why does it not dim the screen like a rest break?** Because it asks you to
  close your work and shut down, and that needs a working screen.
- **8 hours at the keyboard is not 8 hours of wall clock.** Correct, and
  deliberate: idle seconds are not counted, so the daily limit measures a real
  day's work spread over a longer, more irregular stretch.
- **When does it start again?** Switching the computer on always starts a new
  day, and so does a long absence — **end the day after** hours away from the
  keyboard, 6 h by default, 0 to disable. Nothing else resets it by itself:
  not a micro break, not a rest break, not dismissing the message, not
  restarting GNOME Shell. The reasoning is in
  [`../../break-timer.md`](../../break-timer.md#resetting-the-daily-counter).
- **I leave the machine on overnight and the bar is still red in the
  morning.** Brief touches in the night — a cat, a bumped desk, a glance at the
  clock — no longer restart the absence: bursts of input up to 5 minutes long
  are ignored and the time away on either side adds up, so the morning starts a
  new day by itself. If it still has not (you worked late into the night, say),
  **right-click the widget → *Start a new day***: **two clicks**, no question
  asked, today's counter and tonight's window start over.
- **Work that runs past midnight.** Still the same working day — the counter has
  no wall-clock boundary, because a counter that emptied at 00:00 would excuse
  exactly the session that most needs the warning.
- **A lunch break is not the end of the day.** Which is why the daily counter
  ignores the idle rule the other timers use.

## Result

A bar you can read at a glance and a message when the day is up. The counter is
[persisted](../steps.md#r2) along with the boot it belongs to — with when the
day started and how long tonight's window was put off — so a shell restart, a
crash or a change of settings neither hands you a fresh working day nor brings
back a window you already answered.
