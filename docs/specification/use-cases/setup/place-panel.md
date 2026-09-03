# "The panel is in the way — move it"

`@tag:use-case` `@tag:ui`

Back to [setup](index.md) · [use cases](../index.md).

**Goal.** The panel is floating over a window I need, or I want it parked in a
corner and never thought about again.

## Also assumes

[P1](../steps.md#p1), [P2](../steps.md#p2).

## Steps

For a one-off move:

1. [S8](../steps.md#s8) — drag the six-dot handle; drop it where you want it.

**Cost.** One drag. Nothing is confirmed and nothing snaps back.

To pin it to a screen edge instead:

1. [S2](../steps.md#s2) — open preferences.
2. In **Panel layout**, set **Position** to one of the six presets — **Top** or
   **Bottom** × **Start**, **Center** or **End**. The panel jumps there and
   stays put when the screen resolution changes.

**Cost.** Two clicks plus the menu route to preferences.

## Variants

- **Keep exactly where I dragged it.** That is what **Floating (keep position)**
  means — the default; nothing snaps.
- **Give the widgets more room to breathe.** **Content padding** in the same
  group sets the space in pixels around the widgets.
- **Stand it up on its side.** [`orientation.md`](orientation.md).
- **Hide it for a while rather than move it.** [`collapse-panel.md`](collapse-panel.md).

## Result

The panel's position and alignment [apply live](../steps.md#r1) and
[survive a restart](../steps.md#r2). A snap preset keeps working across
resolution and monitor changes; a dragged position is remembered as coordinates.
