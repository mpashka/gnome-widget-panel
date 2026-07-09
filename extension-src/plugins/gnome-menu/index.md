# gnome-menu widget

`@tag:widget-gnome-menu`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that opens a categorized applications menu, like the
XFCE applications menu or the classic Windows Start menu. Installed applications
are grouped into freedesktop top-level categories (one submenu each), rather
than opening the GNOME app grid.

## Behavior

- The button owns a `PopupMenu.PopupMenu` anchored to it (added to
  `Main.uiGroup`, registered with `Main.panel.menuManager`); clicking toggles
  the menu, and `destroy()` tears the menu down.
- Menu contents are built once in the constructor. Installed apps are
  enumerated via `Shell.AppSystem.get_default().get_installed()` and filtered
  with `appInfo.should_show()`.
- Each app is bucketed by the first matching top-level category found in its
  `Categories` string, in priority order: AudioVideo → "Audio & Video",
  Development, Education, Game → "Games", Graphics, Network → "Internet",
  Office, Science, Settings, System, Utility → "Accessories". Apps with no
  known category go to an "Other" bucket.
- Categories are sorted alphabetically with "Other" always last; each is a
  `PopupSubMenuMenuItem` holding alphabetically sorted
  `PopupImageMenuItem` entries (app icon + display name).
- Activating an entry launches the app (`Shell.App.activate()`, falling back to
  `Gio.AppInfo.launch()`), closes the menu and hides the overview if visible.
- The whole enumeration is guarded in try/catch so a broken `.desktop` entry
  cannot crash `create()`/`enable()`; if no apps are found, a single insensitive
  "No applications found" item is shown.

## Options

- `icon` — symbolic icon name shown on the button. Defaults to
  `view-app-grid-symbolic`. Edited in `prefs.ts` via the shared searchable icon
  picker ([`../iconPicker.ts`](../iconPicker.ts)), which shows the actual icon
  and lets you search the theme or type a name.
- `text` — optional text label shown next to (or instead of) the icon.
  Defaults to empty (icon only). Clearing both icon and text is not
  recommended; the button then falls back to its default icon.

## Source files

- `index.ts` — plugin entrypoint; builds the menu-owning `St.Button`,
  enumerates and categorizes installed apps, and launches them on click.
- `prefs.ts` — per-widget settings UI: an icon-picker row for `icon` (see
  [`../iconPicker.ts`](../iconPicker.ts)) and an `Adw.EntryRow` for `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
