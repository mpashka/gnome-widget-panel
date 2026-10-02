# "Home and office need different panels — switch in one go"

`@tag:use-case` `@tag:presets`

Back to [setup](index.md) · [use cases](../index.md). How it is built:
[`implementation/presets.md`](../../../implementation/presets.md).

**Goal.** In the office the laptop sits next to an external monitor; at home it
is the laptop screen alone. The panel I want differs — which widgets, where it
snaps, which way it runs, whether the GNOME top bar stays. I set each up once and
switch between them when I sit down.

## Also assumes

[P1](../steps.md#p1), [P2](../steps.md#p2).

## What a preset holds

The widget list with every widget's settings, **Position** (the snap position —
not the exact spot a panel was dragged to), **Orientation**, **Content padding**
and the **Main panel (top bar)** mode. Collapse, the indicator drawer and AI
collection are shared by all presets.

There is no Save button. **Whatever preset is active receives every change** —
from preferences, from dragging a widget into place, from a widget's own
settings. The preferences window names the active preset in its first row, so
which preset an edit goes into is visible before the edit is made.

**No preset** is a slot of its own: it keeps the settings it had when you left
it and gives them back when you return. On the first run it holds the
configuration you had before presets existed, so trying presets out costs
nothing.

## Switch to the other preset — the frequent case

1. [S1](../steps.md#s1) — right-click the six-dot handle. The presets are listed
   at the top, the active one marked. (The list appears once the first preset
   exists.)
2. Click the one you want. Widgets, position, orientation and top bar change
   together.

**Cost.** Two clicks. Before presets: open preferences, then toggle, add or
remove each differing widget, change Position and the top-bar mode — around ten
clicks and a few reads, every time.

**Frequency.** Twice a day on office days (unmeasured — the owner's estimate).

## Create a preset

1. [S2](../steps.md#s2) — open preferences; the **Preset** group is first.
2. **New preset from current**. A copy of what is on screen now becomes
   **Preset N** and is active; rename it in its row.
3. Change the panel the way this preset should look. The changes land in the new
   preset, not in the one you copied.

**Cost.** The route to preferences and one click, then the edits you came to
make. Not in the handle menu: creating is configuration, done once per place,
and [configuration does not earn a menu row](../../../process/ux.md).

Order matters: copy first, then edit. Editing first and copying afterwards
changes the preset you were in as well — it was active while you edited. If that
happened, switch to it and undo the edit there.

**Frequency.** Once per place, ever.

## Rename a preset

1. [S2](../steps.md#s2) — open preferences; the **Preset** group is first.
2. Edit the name in the preset's row and press the apply tick (or `Enter`).

**Cost.** The route to preferences, a click and the typing.

## Delete a preset

1. [S2](../steps.md#s2) — open preferences.
2. The bin button on the preset's row. A toast offers **Undo**, which restores
   the preset exactly — no confirmation is asked, because nothing is lost.

Deleting the **active** preset does not change what is on screen: the panel stays
as it is and becomes **No preset** (replacing what that slot held; **Undo** puts
both back).

**Cost.** The route to preferences and one click.

## Stop using presets

Choose **No preset** in the handle's menu or in **Active preset**. Changes made
afterwards stay in that slot and leave every named preset alone.

## Variants

- **Switch from preferences.** **Active preset** at the top of the window does
  the same as the menu; the widget list below follows at once.
- **Switch automatically when the external monitor appears.** Not built yet —
  issue [#30](https://github.com/mpashka/gnome-widget-panel/issues/30).

## Result

The switch [applies live](../steps.md#r1) as one change, so the panel relays
out once, and the active preset [survives a restart](../steps.md#r2).
