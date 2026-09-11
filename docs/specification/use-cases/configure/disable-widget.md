# "Off for now, but keep it"

`@tag:use-case` `@tag:ui`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** I do not want this widget on the panel today — during a demo, a
focused week, a screencast — but I do not want to set it up again afterwards.

## Steps

1. [S2](../steps.md#s2) — open preferences ([P4](../steps.md#p4)).
2. Turn the **switch** on that widget's row off.

**Cost.** One click, and one to bring it back.

## Variants

- **Why not just remove it?** [Removing](remove-widget.md) drops that instance's
  options — its command, colours, tooltip template. The switch keeps the row,
  its position in the order and everything you configured.
- **Several widgets at once, temporarily.** [Collapse the
  panel](../setup/collapse-panel.md) instead: one gesture hides all of them and
  one brings them all back.
- **A widget whose *effect* should stop, not its icon.** Some widgets act even
  when you are not looking at them — the [break timer](../wellbeing/index.md)
  reminds, [caffeine](../wellbeing/quiet-during-meeting.md) inhibits. Those have
  their own pause/off gestures on the widget itself
  ([S6](../steps.md#s6)), which is fewer steps than a trip to preferences.

## Result

The widget vanishes from the panel [immediately](../steps.md#r1) and keeps its
place in the list, greyed by its own switch. The disabled state
[survives a restart](../steps.md#r2) — a widget switched off stays off.
