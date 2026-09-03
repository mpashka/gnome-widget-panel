# "Put another widget on the panel"

`@tag:use-case` `@tag:ui`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** I read the [catalog](../../widgets.md) and want one of the optional
widgets — a break timer, a caffeine toggle, my own launch button — on the strip.

## Steps

1. [S2](../steps.md#s2) — open preferences ([P4](../steps.md#p4)).
2. Below the widget list, activate **Add a widget…**. The window turns to an
   **Add a widget** page listing only what is *not* already on the panel, each
   row with its name and one line of description.
3. Click the row you want. The widget is appended to the panel and the window
   returns to the list.

**Cost.** Three clicks from the preferences window; the widget is on the panel
before you close it.

## Variants

- **It isn't in the list.** Either it is already on the panel (the page only
  offers what is missing) or it does not exist yet — the page's top row,
  **Request a widget…**, exists for the second case:
  [`request-widget.md`](request-widget.md).
- **"All widgets added".** What the page says when nothing addable is left.
- **I want a second copy.** Some widgets stay in the list on purpose —
  [`several-instances.md`](several-instances.md).
- **It needs configuring before it is useful** (a launch command, an icon):
  [`tune-widget.md`](tune-widget.md).

## Result

The widget appears at the **end** of the panel — [move it](reorder-widgets.md)
if it belongs elsewhere. The list, the order and the widget's own options all
live in one `widgets` setting, so the panel
[rebuilds live](../steps.md#r1) and the addition
[survives a restart](../steps.md#r2).
