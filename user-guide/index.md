# GNOME Widget Panel — User Guide

Welcome! **GNOME Widget Panel** is a compact floating panel for Ubuntu/GNOME that
hosts a configurable row (or column) of small **widgets** — a clock, a CPU graph,
system indicators, an AI-agent usage graph and more. This guide is for people
*using* the extension. (Contributors and AI agents: see the developer
documentation under [`../docs/`](../docs/index.md).)

## Contents

- [Widgets catalog](widgets.md) — every built-in widget, its icon, what it does
  and its settings.
- [AI agent usage widget — reading the graph](ai-agent-usage.md) — a detailed
  walkthrough of the token-usage graph, with an interactive demo
  ([`ai-agent-usage-preview.html`](ai-agent-usage-preview.html)).

## Installing

Install from the GNOME Extensions store (recommended):

- **https://extensions.gnome.org/extension/10381/gnome-widget-panel/**

Open that page in a browser with the GNOME Shell integration, or use the
**Extensions** / **Extension Manager** app, and toggle it on. Pick the version
matching your GNOME Shell using the support matrix in
[`../CHANGELOG.md`](../CHANGELOG.md). For a manual/development install, see the
[README](../README.md).

## Using the panel

- The panel floats on your desktop and hosts the widgets you enable, in order.
- It can be laid out **horizontally** or **vertically** (the widgets and the AI
  graph rotate to match).
- Most widgets respond to a **left click** (open their menu/target) and show a
  **tooltip on hover**; some also have a **right-click** menu. The per-widget
  details are in the [widgets catalog](widgets.md).

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
[how to file a bug report](../docs/bug-report-howto.md).

---

Back to the [repository README](../README.md).
