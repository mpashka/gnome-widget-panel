# activities widget

`@tag:widget-activities`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that toggles the GNOME Activities overview via
`Main.overview.toggle()`.

## Options

- `icon` — symbolic icon name shown on the button. Defaults to
  `focus-windows-symbolic`. Edited in `prefs.ts` via the shared searchable icon
  picker ([`../iconPicker.ts`](../iconPicker.ts)), which shows the actual icon
  and lets you search the theme or type a name.
- `text` — optional text label shown next to (or instead of) the icon.
  Defaults to empty (icon only). Clearing both icon and text is not
  recommended; the button then falls back to its default icon.

## Source files

- `index.ts` — plugin entrypoint; builds the `St.Button` and wires the click to
  `Main.overview.toggle()`.
- `prefs.ts` — per-widget settings UI: an icon-picker row for `icon` (see
  [`../iconPicker.ts`](../iconPicker.ts)) and an `Adw.EntryRow` for `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
