# "Stand the panel up — my screen is short, not narrow"

`@tag:use-case` `@tag:ui`

Back to [setup](index.md) · [use cases](../index.md).

**Goal.** On a wide screen, vertical pixels are the scarce ones. I want the
panel as a narrow strip down the side instead of a bar across the top.

## Also assumes

[P1](../steps.md#p1), [P2](../steps.md#p2).

## Steps

1. [S2](../steps.md#s2) — open preferences.
2. In **Panel layout**, set **Orientation**:
   - **Horizontal** — the default strip.
   - **Vertical left** — a standing strip whose graphs rotate counter-clockwise
     and whose clock reads bottom→top.
   - **Vertical right** — the same standing strip mirrored: graphs rotate
     clockwise, the clock reads top→bottom.
3. [Place it](place-panel.md) against the side you chose.

**Cost.** Two clicks; the panel reflows immediately with nothing to restart.

## Variants

- **Which of the two vertical modes?** Pick the one whose text runs the way you
  tilt your head — that is the only difference, and it applies to the whole
  panel at once.
- **A widget looks squashed standing up.** The strip's thickness is fixed on
  both axes, and the graph widgets rotate rather than stretch; a widget that
  looks clipped is a bug worth [reporting](../support/report-bug.md).

## Result

Every widget re-lays itself out along the new axis — the CPU and AI graphs
rotate 90°, the clock and the indicators follow. The choice
[applies live](../steps.md#r1) and [survives a restart](../steps.md#r2).
