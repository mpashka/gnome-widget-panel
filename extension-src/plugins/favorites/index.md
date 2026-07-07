# favorites widget

`@tag:widget-favorites`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that opens a "Places" popup menu. The menu lists Home,
the existing XDG user directories and any GTK bookmarks; activating an entry
opens that location in the default file manager via
`Gio.AppInfo.launch_default_for_uri`.

## Behaviour

- Entries: `Home`, then existing XDG user dirs
  (`GLib.get_user_special_dir(...)` for Documents, Downloads, Music, Pictures,
  Videos, Desktop, Public share, Templates), then GTK bookmarks parsed from
  `$XDG_CONFIG_HOME/gtk-3.0/bookmarks` (each line a `file://` URI with an
  optional trailing label), separated from the XDG entries.
- The `PopupMenu` actor is added to `Main.uiGroup` and registered with
  `Main.panel.menuManager`, mirroring `controlButton.ts`. It is destroyed in
  `destroy()`.

## Options

- `icon` — symbolic icon name shown on the button. Defaults to `folder-symbolic`.
  Edited in `prefs.ts`.
- `text` — optional text label shown next to (or instead of) the icon. Defaults
  to `Places`. Clearing both icon and text is not recommended; the button then
  falls back to its default icon.

## Source files

- `index.ts` — plugin entrypoint; builds the `St.Button`, its `PopupMenu` and
  the place entries; opens each location on activation.
- `prefs.ts` — per-widget settings UI: `Adw.EntryRow`s for `icon` and `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
