# cpu-load-monitor widget

`@tag:widget-cpu-load-monitor`

Back to [plugins index](../index.md).

## Purpose

Displays a compact CPU load graph with temperature-aware color changes.
The temperature model is data-driven: an ascending-by-temperature `bands` array
of `{name, temp, color}`. The active band is the highest band whose `temp` is at
or below the current temperature; below the lowest band (or when the temperature
is unknown) the widget uses the theme foreground colour ("normal").
The hover tooltip is a user-editable template (see
[`../../tooltipTemplate.ts`](../../tooltipTemplate.ts), `@tag:ui`) rendered with
Pango markup. The default template `cpu: {load}, {temp}\n°C: {legend}` reproduces
the original two-line tooltip: line 1 is `load%, temp°C` with the temperature
coloured by the active band's colour (normal is not coloured); line 2 is the
band legend built from consecutive band temps (`t0..t1, t1..t2, >tlast`), each
range in its band colour with the active band in bold. The below-lowest (normal)
range is intentionally not shown in the legend.

Template tokens (each a ready-built coloured markup fragment):

- `{load}` — load percent, e.g. `37%`.
- `{temp}` — the coloured `NN°C` (or `?` when unknown).
- `{legend}` — the coloured band-range legend.

Literal template text is Pango-escaped and `\n` is a line break; unknown tokens
render empty. The settings page shows a live preview of the rendered template.

## Source files

- `index.ts` — plugin entrypoint; passes widget `options` to the graph.
- `cpuGraph.ts` — `St.DrawingArea` implementation; reads `/proc/stat`, detects
  CPU temperature thermal zone and paints the graph.
- `prefs.ts` — widget settings UI. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).

## Options

The widget reads per-widget `options` from `widgets.json`:

- `bands` — array of `{name, temp, color}` sorted ascending by `temp`, used for
  both the graph fill and the tooltip legend. Defaults to
  `[{green,50,#3dc752},{yellow,65,#ffc729},{red,80,#f03333}]` when missing or
  invalid. Band names and count are fixed in the settings UI (only `temp` and
  `color` are editable) but are part of the stored configuration.
- `width` — graph width in pixels (default 32). Height is fixed.
- `updateInterval` — sampling period in seconds (default 2, minimum 1).
- `showTooltip` — set `false` to disable the hover tooltip.
- `template` — hover-tooltip template string (default
  `cpu: {load}, {temp}\n°C: {legend}`). Tokens `{load}`, `{temp}`, `{legend}`;
  literal text is Pango-escaped and `\n` is a line break. Edited with a live
  preview in the settings page.

## Vertical panel rotation

The graph implements `setPanelLayout({vertical, rotation})`, called by the panel
host. When the panel is vertical it swaps its actor size (tall/narrow) and rotates
the Cairo drawing 90° so the time axis runs along the strip; `rotation` (`left` /
`right`, from the panel `vertical-rotation` setting) picks the direction. See
[preferences](../../../docs/preferences.md).

In a vertical panel the hover tooltip is placed to the side of the widget (left
when the widget is in the right half of the monitor, otherwise right), vertically
centred and clamped to the monitor, so it does not overlap the strip; the
horizontal panel keeps the original above/below placement.

## Data and lifecycle

Sampling runs on a GLib timer and must be stopped in `destroy()`. No persistent
state is used.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
