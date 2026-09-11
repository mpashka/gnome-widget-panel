# "Reclaim the GNOME top bar"

`@tag:use-case` `@tag:main-panel`

Back to [setup](index.md) · [use cases](../index.md).

**Goal.** This panel already shows me the clock, the indicators and the app
menu, so the GNOME top bar is a row of pixels doing nothing. I want it gone —
without installing a second extension for it.

## Also assumes

[P1](../steps.md#p1). Worth having on the panel first ([P3](../steps.md#p3)) the
widgets that replace what the top bar gave you: [Clock](../monitor/read-clock.md),
[System status](../monitor/quick-settings.md),
[App notifications](../monitor/background-apps.md),
[Keyboard layout](../monitor/keyboard-layout.md).

## Steps

1. [S2](../steps.md#s2) — open preferences.
2. In **Main panel (top bar)**, set **Top-bar behaviour**:
   - **Visible** — leave GNOME's bar alone (the default);
   - **Auto hide** — hide it, but slide it back in when the pointer pushes
     against the top edge, and whenever the Overview is open;
   - **Hidden** — keep it hidden.

**Cost.** Two clicks. The bar goes at once, with no logout.

## Variants

- **I already have Hide Top Bar installed.** The preferences page detects it and
  says so, because two extensions fighting over the same bar produce a flicker,
  not a hidden bar. If it is **enabled**, this panel's own control stands down
  and the combo is disabled — remove or disable Hide Top Bar to use this one.
  The banner has a **Remove…** button that uninstalls it through GNOME's own
  mechanism, with a confirmation (it is not reversible, which is exactly when a
  dialog is [warranted](../../../process/ux.md)) and a report of what actually
  happened.
- **Keep the bar but stop it stealing a row.** **Auto hide** is the middle
  option: the bar is reachable by a deliberate push at the edge, and invisible
  the rest of the time.
- **I lost the Activities button with it.** Add the
  [Gnome Action](../launch/start-application.md) widget — it opens the Overview
  or the app grid from the panel.

## Result

The top bar's behaviour [applies live](../steps.md#r1) and
[survives a restart](../steps.md#r2). It is a separate setting from the floating
panel, so hiding the bar and [collapsing the panel](collapse-panel.md) are
independent.
