# "I want a row of my own buttons"

`@tag:use-case` `@tag:widget-launch`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** Three things I start ten times a day — a terminal running `htop`, my
mail client, a VPN script — each as its own button on the panel.

## Steps

1. [S2](../steps.md#s2) → **Add a widget…** → **Launch**
   ([`add-widget.md`](add-widget.md)).
2. [S5](../steps.md#s5) on the new row: set its **command**
   (e.g. `gnome-terminal -- htop`), its [icon](../steps.md#s10) and, if you want
   text on the panel, a **label**.
3. Repeat for the next button — **Launch** stays in the *Add a widget* list on
   purpose, because a launcher is only useful in the plural.
4. [Drag the rows](reorder-widgets.md) into the order you want them on the
   panel.

**Cost.** Roughly four clicks plus a command per button, once and for all.

## Variants

- **Two Overview buttons doing different things.** **Gnome Action** is
  multi-instance too: one instance opening the Overview, another the app grid,
  another showing the desktop — see
  [`../launch/start-application.md`](../launch/start-application.md).
- **They all look the same on the panel.** Give each its own
  [icon](../steps.md#s10) and label; the options belong to the instance, so two
  copies of the same widget never share them.
- **Nothing happens on click.** An empty command does nothing by design; check
  the command runs in a terminal first.
- **The widget I want to duplicate stays out of the list after adding.** Then it
  is single-instance — one clock, one CPU graph — and a second copy would only
  draw the same data twice.

## Result

Each instance is its own row in the list with its own `options`, so it can be
[reordered](reorder-widgets.md), [switched off](disable-widget.md) or
[removed](remove-widget.md) independently. All of it
[applies live](../steps.md#r1).
