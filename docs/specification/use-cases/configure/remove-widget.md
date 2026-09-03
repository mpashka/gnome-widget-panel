# "Take a widget off the panel"

`@tag:use-case` `@tag:ui`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** One of the default widgets tells me nothing I need, and it is eating
panel width.

## Steps

1. [S2](../steps.md#s2) — open preferences ([P4](../steps.md#p4)).
2. On that widget's row in **Panel widgets**, use the **remove** button.

**Cost.** Two clicks, no confirmation — the widget is
[re-addable](add-widget.md) in three.

## Variants

- **I might want it back next week, with its settings.** Do not remove it —
  [switch it off](disable-widget.md). Removal drops that instance's options;
  disabling keeps them.
- **I want the whole panel out of the way, not one widget.**
  [`../setup/collapse-panel.md`](../setup/collapse-panel.md).
- **The last widget is gone.** The list says **No widgets configured** and
  points at the Add button; the panel is then just its handle, which still has
  its menu.

## Result

The widget disappears from the panel [at once](../steps.md#r1). Nothing else is
reordered — the widgets after it simply close up.
