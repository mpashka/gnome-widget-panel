# "Nothing must dim or lock for the next hour"

`@tag:use-case` `@tag:widget-caffeine` `@tag:widget-break-timer` `@tag:session-inhibitor`

Back to [wellbeing](index.md) · [use cases](../index.md).

**Goal.** A video call, a presentation, a long build I am watching. The screen
must stay on, the session must not suspend, and no break reminder may appear on
a shared screen.

## Also assumes

Either widget alone covers this: **Caffeine**, or **Break timer**
([add](../configure/add-widget.md) the one you keep).

## Steps

With **Caffeine**:

1. [S6](../steps.md#s6) on the widget — right-click picks a **duration**:
   15 min, 30 min, 1 h, 2 h, or until turned off.
2. It switches itself off when the time is up. While it is on, the **break timer
   stays silent** as well.

With **Break timer**:

1. [S6](../steps.md#s6) on the widget — **pause** the timers for 30 min, 1 h or
   1:30 (all three lengths are settings), or resume them.
2. The pause **also keeps the screen awake**, and the widget shows a **coffee
   cup and one bar** counting the pause down instead of the three timer bars.

**Cost.** Two clicks, and it ends by itself — nothing to remember afterwards.

## Variants

- **Indefinitely.** A plain left click on Caffeine toggles it on with no end
  time (the button looks pressed while it is on); click again to release it.
- **How long is left?** [S4](../steps.md#s4) — hovering says what it is doing
  and how much time remains (`Paused — 42:10 left, screen kept awake`, or
  `Silent — the screen is kept awake` when something else is holding the
  session open — then the timer bars stay, only dimmed).
- **It ends by itself.** Every pause expires on its own, because a pause you can
  forget to end is a timer you switched off by accident; **Resume** also says how
  much of it is left. A pause lives for the session — restarting GNOME Shell
  ends it, unlike the counters.
- **Which widget should I keep?** One is enough, and the pairing is deliberate:
  either gesture gets you both effects, because the meeting a pause covers is
  exactly when a lock screen is unwelcome.
- **Screensaver only, not suspend.** Caffeine's **inhibit suspend** option is on
  by default and also blocks auto-suspend; turn it off to inhibit only the
  screensaver.
- **I forgot to switch it on.** The break screen already stands aside for a
  fullscreen application, an active recording or a screen share — but a timed
  keep-awake is the deliberate version, and it is quieter.
- **I forgot to switch it off.** The timed variants cannot be forgotten; the
  indefinite one can, which is why the button looks pressed while it holds.

## Result

The session stays awake for exactly as long as you asked, the reminders stay
silent for that time, and both return to normal on their own. The counters keep
counting activity underneath — a pause postpones the reminder, it does not
cancel the work you did.
