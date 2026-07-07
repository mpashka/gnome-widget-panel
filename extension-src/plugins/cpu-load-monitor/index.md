# cpu-load-monitor widget

`@tag:widget-cpu-load-monitor`

Back to [plugins index](../index.md).

## Purpose

Displays a compact CPU load graph with temperature-aware color changes.
The hover tooltip is two lines: line 1 is `load%, temp°C` with the temperature
coloured by its band (below 50°C uses the default foreground, so it is not
coloured); line 2 is the band legend `50..65, 65..80, >80`, each range in its
colour (green/yellow/red) with the current band in bold. The grey (below-50°C)
band is intentionally not shown in the legend. Rendered with Pango markup.

## Source files

- `index.ts` — plugin entrypoint; passes widget `options` to the graph.
- `cpuGraph.ts` — `St.DrawingArea` implementation; reads `/proc/stat`, detects
  CPU temperature thermal zone and paints the graph.
- `prefs.ts` — widget settings UI. See
  [`../../../docs/preferences.md`](../../../docs/preferences.md).

## Options

The widget reads per-widget `options` from `widgets.json`: temperature
thresholds (`greenTemp` 50, `warmTemp` 65, `hotTemp` 80), band colours
(`colorGreen`, `colorYellow`, `colorRed`) used for both the graph fill and the
tooltip legend, and `showTooltip` to disable the hover tooltip.

## Data and lifecycle

Sampling runs on a GLib timer and must be stopped in `destroy()`. No persistent
state is used.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
