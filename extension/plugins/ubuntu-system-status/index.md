# ubuntu-system-status widget

Back to [plugins index](../index.md).

## Purpose

Shows standard Ubuntu/GNOME system indicators such as network, volume, battery
and related quick settings state inside the floating panel.

## Source files

- `index.ts` — plugin entrypoint.
- `quickButton.ts` — wraps GNOME Shell `quickSettings`, clones visible
  indicators and redirects menu source actor while mapped.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
