# printscreen widget

`@tag:widget-printscreen`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that opens the GNOME interactive screenshot UI
(`Main.screenshotUI.open()`) — the same overlay the PrintScreen key shows, with
area/window/screen selection, screen recording and the capture button. The call
is wrapped in try/catch so a failure can never break the button or the panel.

It is disabled by default in the bundled `widgets.json`; enable or add it from
the preferences UI.

## Options

- `icon` — symbolic icon name shown on the button. Defaults to
  `camera-photo-symbolic`. Edited in `prefs.ts` via the shared searchable icon
  picker ([`../iconPicker.ts`](../iconPicker.ts)), which shows the actual icon
  and lets you search the theme or type a name.
- `text` — optional text label shown next to (or instead of) the icon.
  Defaults to empty (icon only). Clearing both icon and text is not
  recommended; the button then falls back to its default icon.

## Source files

- `index.ts` — plugin entrypoint; builds the `St.Button` and opens the
  screenshot UI on click.
- `prefs.ts` — per-widget settings UI: an icon-picker row for `icon` (see
  [`../iconPicker.ts`](../iconPicker.ts)) and an `Adw.EntryRow` for `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
