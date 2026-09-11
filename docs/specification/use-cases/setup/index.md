# Setup — getting the panel onto the screen

`@tag:use-case`

Back to the [use cases](../index.md) · [widgets catalog](../../widgets.md).

The goals you have **before** you care about any particular widget: put the
panel on the desktop, decide where it lies and which way it runs, get it out of
the way when it is in the way, and — if it is replacing the GNOME top bar —
reclaim that strip of screen.

## Context

Inherited by every case in this directory:

- A GNOME Shell desktop session (Wayland or X11) you can install extensions on.
- Nothing about the panel is assumed yet: [`install.md`](install.md) is the one
  case that starts from an empty desktop; the others take
  [P1](../steps.md#p1) — installed and enabled.

## After

- The change is stored in the extension's own GSettings, so it
  [applies live](../steps.md#r1) and [survives a restart](../steps.md#r2).
- Nothing here touches your widget list — that is
  [`configure/`](../configure/index.md).

## Cases

- [`install.md`](install.md) — "I saw a screenshot of this panel and want it on
  my desktop."
- [`place-panel.md`](place-panel.md) — "It is sitting on top of something I
  need" — drag it, or snap it to an edge.
- [`orientation.md`](orientation.md) — "My screen is wider than it is tall" —
  stand the panel up as a vertical strip.
- [`collapse-panel.md`](collapse-panel.md) — "I need the screen space right now,
  but not to uninstall anything."
- [`replace-top-bar.md`](replace-top-bar.md) — "If I have this panel, the GNOME
  top bar is a wasted row."
