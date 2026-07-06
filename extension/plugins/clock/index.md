# clock widget

Back to [plugins index](../index.md).

## Purpose

Shows the GNOME clock/date button inside the floating panel and opens the
standard GNOME date menu from that location.

## Source files

- `index.ts` — plugin entrypoint.
- `dateButton.ts` — wraps GNOME Shell `dateMenu`, redirects menu source actor
  while mapped, and restores the original source on unmap/destroy.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
