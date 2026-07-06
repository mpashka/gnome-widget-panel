# cpu-load-monitor widget

Back to [plugins index](../index.md).

## Purpose

Displays a compact CPU load graph with temperature-aware color changes.

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
