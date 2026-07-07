# clock widget

`@tag:widget-clock`

Back to [plugins index](../index.md).

## Purpose

Shows a clock/date button inside the floating panel and opens the standard
GNOME date menu from that location. The label text is rendered from a
configurable strftime/`date` template.

## Options

- `format` — strftime-style template rendered by
  `GLib.DateTime.get_now_local().format(...)`, e.g. `%H:%M` or
  `%a %d %b %H:%M:%S`. Defaults to `%H:%M`. Edited in `prefs.ts`.

## Source files

- `index.ts` — plugin entrypoint; passes `options` to the button.
- `dateButton.ts` — wraps GNOME Shell `dateMenu` (redirects menu source actor
  while mapped, restores it on unmap/destroy) and renders the `format` label on
  a one-second timer released in `destroy()`.
- `prefs.ts` — per-widget settings UI: an `Adw.EntryRow` editing `format`.

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
