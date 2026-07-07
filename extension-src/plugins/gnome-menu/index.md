# gnome-menu widget

`@tag:widget-gnome-menu`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that opens the GNOME application grid (all
applications) via `Main.overview.showApps()`.

## Options

- `icon` — symbolic icon name shown on the button. Defaults to
  `view-app-grid-symbolic`. Edited in `prefs.ts`.
- `text` — optional text label shown next to (or instead of) the icon.
  Defaults to empty (icon only). Clearing both icon and text is not
  recommended; the button then falls back to its default icon.

## Source files

- `index.ts` — plugin entrypoint; builds the `St.Button` and wires the click to
  `Main.overview.showApps()`.
- `prefs.ts` — per-widget settings UI: `Adw.EntryRow`s for `icon` and `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
