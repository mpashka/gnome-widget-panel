# "A break is due and I am mid-sentence"

`@tag:use-case` `@tag:widget-break-timer`

Back to [wellbeing](index.md) · [use cases](../index.md).

**Goal.** The reminder has appeared. I want to finish the line I am typing, and
then either take the break or say why not — without losing my focus, my
keystrokes or my window.

## Also assumes

The **Break timer** widget running with its timers on
([`regular-breaks.md`](regular-breaks.md)).

## Steps

1. **The warning appears** shortly before the break: a passive message with a
   live countdown (`Rest break in 24 s`). It **never takes focus** and never
   grabs input — keep typing; the keystrokes go where they were going.
2. Choose:
   - **Take the hint and stop.** If the pause reaches the break length, the
     break has been taken: the message goes, the timer resets, no break screen.
   - **Keep working.** At zero the screen dims and the **break screen** appears
     on every monitor, counting the break down. It swallows input so typing
     cannot leak into applications, but leaves window focus alone — when it ends
     you are back in the same window.
3. On the break screen (or on the warning once it has moved out of your
   pointer's way): **Postpone** offers the break again in a few minutes and you
   still owe it; **Skip** cancels this one and resets *that* timer; `Esc`
   postpones where postponing is allowed.

**Cost.** Zero gestures to take the break; one click to postpone or skip.

## Variants

- **It is covering what I need to click.** Move the pointer to it: it flies once
  to the anchor furthest from the pointer and **stays there** for that showing —
  no fleeing, no motion at the edge of your eye. You can also **drag it**
  anywhere.
- **Its buttons are missing.** On its opening anchor the warning is a plain hint;
  the buttons appear once it has stepped aside, because before that they would
  act on a break that has not begun.
- **The message is somewhere unhelpful.** [S6](../steps.md#s6) — the widget's
  own right-click menu has the same postpone/skip actions on a target that never
  moves.
- **I am presenting / recording / watching something fullscreen.** The break
  screen stays away and the break degrades to the message, offered again after a
  minute of further work — so it arrives when the film or the presentation is
  over.
- **I do not want an escape hatch.** Turn postpone and skip off per timer
  ("strict mode", off by default): then the break screen can only be waited out.
- **Skipping a rest break brought a micro break.** Correct: a *skipped* break
  resets only its own timer, unlike a break actually taken.

## Result

Either the break happened (and the timer reset), or you owe it and know that you
do. The [full contract](../../break-timer.md) covers both stages and every
suppression rule.
