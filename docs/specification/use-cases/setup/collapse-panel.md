# "Get it out of the way for a while"

`@tag:use-case` `@tag:ui`

Back to [setup](index.md) · [use cases](../index.md).

**Goal.** I am about to share my screen / play something full-screen / need the
pixels, and I want the panel gone — without losing it or my configuration.

## Also assumes

[P1](../steps.md#p1), [P2](../steps.md#p2).

## Steps

1. [S1](../steps.md#s1) — right-click the six-dot handle.
2. Choose **Collapse**. Every widget disappears; the handle stays, and the panel
   takes almost no room.

**Cost.** Two clicks, and the same two to undo it.

To bring the widgets back:

1. [S1](../steps.md#s1) on the handle that is left.
2. Choose **Expand** — the same menu item, [toggled](../../../process/ux.md) to
   the action that applies now.

## Variants

- **I want it gone, not small.** Switch the extension off in the Extensions app;
  your widget list and positions are kept in GSettings and come back with it.
- **Only one widget is in the way.** Disable that one instead —
  [`../configure/disable-widget.md`](../configure/disable-widget.md).
- **Middle-click does nothing while collapsed.** Correct: the
  [indicator drawer](../steps.md#s9) contents are hidden along with everything
  else, so the gesture is ignored until you expand.

## Result

The handle keeps its menu while collapsed, so the panel can never hide
itself somewhere unreachable. The collapsed state
[survives a restart](../steps.md#r2) — a panel you collapsed comes back
collapsed.
