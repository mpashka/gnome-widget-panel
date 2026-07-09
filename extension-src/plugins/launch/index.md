# launch widget

`@tag:widget-launch`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that launches a configured command line when clicked
(`GLib.spawn_command_line_async(options.command)`, guarded by try/catch; nothing
happens if the command is empty).

This widget is **multi-instance**: it can be added to the panel any number of
times, each instance with its own command, icon and label. Because it stays
available in the "Add a widget" list even after being added, you can build a row
of custom launchers (terminal, editor, monitor, …). It is not part of the
default `widgets.json`; users add and configure each instance themselves.

## Options

- `command` — the full command line to run, arguments included (e.g.
  `gnome-terminal -- htop`). Parsed and launched by GLib.
- `icon` — symbolic icon name shown on the button. Defaults to
  `application-x-executable-symbolic`. Edited in `prefs.ts` via the shared
  searchable icon picker ([`../iconPicker.ts`](../iconPicker.ts)).
- `text` — optional text label shown next to (or instead of) the icon.
  Defaults to empty (icon only).

## Source files

- `index.ts` — plugin entrypoint; builds the `St.Button` and spawns the command
  on click.
- `prefs.ts` — per-widget settings UI: an icon-picker row for `icon` (see
  [`../iconPicker.ts`](../iconPicker.ts)), a "Command" `Adw.EntryRow` and a
  "Label" `Adw.EntryRow`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
