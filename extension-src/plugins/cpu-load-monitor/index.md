# cpu-load-monitor widget

Back to [plugins index](../index.md).

## Purpose

Displays a compact CPU load graph with temperature-aware color changes.
The hover tooltip shows current CPU load, current temperature, and the color
legend: normal foreground below 50°C, green from 50°C to 64°C, yellow from
65°C to 79°C, and red from 80°C.

## Source files

- `index.ts` — plugin entrypoint.
- `cpuGraph.ts` — `St.DrawingArea` implementation; reads `/proc/stat`, detects
  CPU temperature thermal zone and paints the graph.

## Data and lifecycle

Sampling runs on a GLib timer and must be stopped in `destroy()`. No persistent
state is used.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
