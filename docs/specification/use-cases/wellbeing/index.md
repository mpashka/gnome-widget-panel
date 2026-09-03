# Wellbeing — stopping at sane intervals, and being left alone

`@tag:use-case`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals about **when you work and when the machine leaves you alone**: rest
reminders that measure real work rather than uptime, and the two ways to make
everything shut up for a while. These two widgets are deliberately linked —
whatever keeps the screen awake also silences the reminders, because a meeting
is exactly when both matter.

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1), [P2](../steps.md#p2).
- [P3](../steps.md#p3) — **Break timer** and **Caffeine** are both optional, so
  [add](../configure/add-widget.md) the ones a case uses.
- Their actions live on the widget itself: [S6](../steps.md#s6) — right-click —
  is the primary route, not a trip to preferences.
- What the timers count is **activity**, not wall-clock time: a second counts
  only if the session saw keyboard or mouse input in the last 5 seconds.

## After

- The timer counters are written to a state file, so they
  [survive a shell restart](../steps.md#r2) — a daily counter that a crash
  zeroes measures nothing.
- Settings ([durations](../steps.md#s11), colours, modes)
  [apply live](../steps.md#r1).

## Cases

- [`regular-breaks.md`](regular-breaks.md) — "Make me stop before my wrists
  do."
- [`answer-reminder.md`](answer-reminder.md) — "A break is due and I am
  mid-sentence."
- [`quiet-during-meeting.md`](quiet-during-meeting.md) — "Nothing must dim or
  lock for the next hour."
- [`end-of-day.md`](end-of-day.md) — "Tell me when the working day is over."

The full behaviour contract — the three timers, every reset rule and both
reminder stages — is [`../../break-timer.md`](../../break-timer.md).
