# "Put the widgets in the order I read them"

`@tag:use-case` `@tag:ui`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** The clock should be at the far end, the menu at the start, and the
graph between them — the panel should read the way I look at it.

## Steps

1. [S2](../steps.md#s2) — open preferences ([P4](../steps.md#p4)).
2. **Drag a row by its drag handle** to where it belongs. The panel reorders as
   the list does.

**Cost.** One drag per widget, exactly like GNOME's own reorderable lists.

## Variants

- **A newly added widget is at the end.** That is where
  [adding](add-widget.md) puts it; drag it to its place.
- **Vertical panel.** The same list order runs top→bottom instead of
  left→right — see [`../setup/orientation.md`](../setup/orientation.md).
- **There are no up/down arrows.** Deliberate: dragging one row is one gesture
  where the arrows were one click per position moved.

## Result

List order **is** panel order. It [applies live](../steps.md#r1), needs no
saving ([R3](../steps.md#r3)) and [survives a restart](../steps.md#r2).
