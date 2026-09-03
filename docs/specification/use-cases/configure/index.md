# Configure — deciding what is on the panel

`@tag:use-case` `@tag:ui`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals about the panel's **contents**: which widgets are on it, in which
order, switched on or off, and tuned how. Everything here is one window and one
GSettings key — there is no second place widgets are configured.

## Context

Inherited by every case in this directory:

- [P1](../steps.md#p1) — the extension is installed and enabled.
- The **preferences window** is the workplace: [P4](../steps.md#p4), reached by
  [S2](../steps.md#s2). Its **Widgets** page holds the widget list, the panel
  layout group, the top-bar group and About.
- The widget list *is* the panel order: top of the list = first on the panel.

## After

- [R1](../steps.md#r1) — the running panel rebuilds itself at once; no logout,
  no shell restart.
- [R3](../steps.md#r3) — there is no *Apply* button and no confirmation; the
  change is written as you make it.
- [R2](../steps.md#r2) — it comes back the same after a restart.

## Cases

- [`add-widget.md`](add-widget.md) — "I want a widget the panel doesn't show
  yet."
- [`remove-widget.md`](remove-widget.md) — "This one is useless to me."
- [`disable-widget.md`](disable-widget.md) — "Not now, but keep it and its
  settings."
- [`reorder-widgets.md`](reorder-widgets.md) — "The clock should be at the end,
  not in the middle."
- [`tune-widget.md`](tune-widget.md) — "Right widget, wrong icon / colour /
  interval."
- [`several-instances.md`](several-instances.md) — "I want three launch buttons,
  not one."
- [`request-widget.md`](request-widget.md) — "The widget I need doesn't exist."
