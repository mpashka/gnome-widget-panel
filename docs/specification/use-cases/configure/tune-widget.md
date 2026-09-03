# "Right widget, wrong icon / colour / interval"

`@tag:use-case` `@tag:prefs-template`

Back to [configure](index.md) · [use cases](../index.md).

**Goal.** The widget does what I want but looks or behaves slightly wrong — the
icon is not the one I associate with it, the graph is too narrow, the tooltip
says too much.

## Steps

1. [S5](../steps.md#s5) — the gear button on the widget's row opens its own
   settings as a subpage ([P5](../steps.md#p5)).
2. Change what you came for. The rows are the ones listed for that widget in the
   [catalog](../../widgets.md):
   - **Icon** — [S10](../steps.md#s10), the searchable symbolic-icon picker;
   - **Label** — optional text beside (or instead of) the icon;
   - **Colours**, **width**, **update interval** — for the graph widgets;
   - **Durations** — [S11](../steps.md#s11);
   - **Tooltip** — on/off and a template with the widget's own placeholders
     (e.g. `{app}`, `{count}`, `{window}`); an empty template means no tooltip.
3. Use the header bar's back button to return to the list.

**Cost.** Two clicks to the settings page; every row applies as you change it.

## Variants

- **The row I want isn't there.** Widgets with nothing to configure (System
  status, App notifications, Keyboard layout) show no gear button — they mirror
  GNOME's own indicators and inherit their behaviour.
- **The clock format.** A strftime string, plus a small markup subset for
  styling part of the time; the settings page previews it live and tells you
  when the markup is invalid — [`../monitor/read-clock.md`](../monitor/read-clock.md).
- **Two copies of a widget, configured differently.** That is what
  [`several-instances.md`](several-instances.md) is for — options belong to the
  instance, not to the widget type.
- **A widget with its own setup step** (the AI widgets' **Configure** button):
  [`../ai-agents/connect-claude.md`](../ai-agents/connect-claude.md).

## Result

Every option is written to that widget instance's `options`, so the panel
[re-renders live](../steps.md#r1) with nothing to save
([R3](../steps.md#r3)) and the tuning [survives a restart](../steps.md#r2).
