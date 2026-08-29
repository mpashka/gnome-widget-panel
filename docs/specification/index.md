# Specification — GNOME Widget Panel user guide

Welcome! **GNOME Widget Panel** is a compact floating panel for Ubuntu/GNOME that
hosts a configurable row (or column) of small **widgets** — a clock, a CPU graph,
system indicators, an AI-agent usage graph and more.

This directory describes how the extension **looks and behaves for the person
using it**: what each widget is, its icon, what it does and which settings it
offers. It is the user-facing contract; how any of it is built is in
[`../implementation/index.md`](../implementation/index.md), and the rest of the
agent-facing tree starts at [`../index.md`](../index.md).

## Files

- [`widgets.md`](widgets.md) — widgets catalog: every built-in widget, its icon,
  what it does and its settings. Update it in the same change that alters a
  widget's user-visible behaviour, icon or options.
- [`ai-agent-usage.md`](ai-agent-usage.md) — reading the AI agent usage graph: a
  detailed walkthrough of the token-usage graph
  (`@tag:widget-ai-agent-usage`).
- `ai-agent-usage-preview.html` — interactive demo of that graph, linked from the
  walkthrough ([open it](ai-agent-usage-preview.html)).

Per-widget detail beyond the catalog lives next to the widget's code, in
[`../../extension-src/plugins/<id>/index.md`](../../extension-src/plugins/index.md).

## Installing

Install from the GNOME Extensions store (recommended):

- **https://extensions.gnome.org/extension/10381/gnome-widget-panel/**

Open that page in a browser with the GNOME Shell integration, or use the
**Extensions** / **Extension Manager** app, and toggle it on. Pick the version
matching your GNOME Shell using the support matrix in
[`../../CHANGELOG.md`](../../CHANGELOG.md). For a manual/development install, see the
[README](../../README.md).

## Using the panel

- The panel floats on your desktop and hosts the widgets you enable, in order.
- It can be laid out **horizontally** or **vertically** (the widgets and the AI
  graph rotate to match).
- Most widgets respond to a **left click** (open their menu/target) and show a
  **tooltip on hover**; some also have a **right-click** menu. The per-widget
  details are in the [widgets catalog](widgets.md).

### The drag handle (the six dots)

The six-dot handle at the start of the panel is its caption:

- **Drag** it to move the panel; it starts moving on the first pointer movement.
- **Right-click** it for the panel's own menu: Collapse/Expand, Settings…,
  Release notes, the extensions.gnome.org page, Report a bug, Suggest a feature.
- **Middle-click** toggles the indicator drawer.

### Collapsing the panel

Choose **Collapse** in the handle's right-click menu to shrink the panel down to
just that handle — every widget is hidden and the panel takes almost no room.
The handle stays on screen and keeps its menu, which now offers **Expand** to
bring the widgets back. The collapsed state is remembered, so a panel you
collapsed comes back collapsed after a restart.

## Configuring widgets

Open the preferences UI to add, remove, reorder, enable/disable and configure
widgets:

```bash
gnome-extensions prefs gnome-widget-panel@mpashka.github.com
```

or open **GNOME Widget Panel** in the Extensions / Extension Manager app and
click its settings (gear) button. Changes apply **live** — no logout needed.
Widgets that have their own settings (for example the AI agent usage widget) show
a settings button that opens their own dialog.

## Reporting a problem

Found a bug? Please file it with your configuration and a screenshot or short
screencast — that is what makes it fixable quickly. See
[how to file a bug report](../process/bug-report-howto.md).

---

Back to the [documentation index](../index.md) and the
[repository README](../../README.md).
