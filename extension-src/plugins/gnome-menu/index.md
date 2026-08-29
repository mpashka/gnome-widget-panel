# gnome-menu widget

`@tag:widget-gnome-menu`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that opens a categorized applications menu, like the
XFCE Whisker menu or the classic Windows Start menu: a LEFT column of category
names and a RIGHT column showing the applications of the selected category,
rather than opening the GNOME app grid.

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
- The first category is "Favorites" (the `org.gnome.shell` `favorite-apps` list,
  in its own order) when it is not empty; the rest are sorted alphabetically
  with "Other" always last, and each category's apps are sorted alphabetically.
- Selecting a category — by click **or by hover** — refills the right pane.
- **The popup is one fixed size, whatever is selected** (`_updateMenuHeight`):
  both panes have a fixed width and scroll, and the height is what the panel's
  monitor work area can spare, capped at 500px. This is load-bearing, not
  cosmetic: the popup is anchored to the panel, so one that grows with the
  selected category pushes its own category rows out from under the pointer, the
  pointer then hovers the neighbouring category, that one resizes it back, and
  the menu shakes. With the panel at the bottom the popup grows upwards, so a
  long category also ran off the top of the screen. Pinned by
  [`t-17-menu-size-stable.sh`](../../../tests/ui/index.md).
- Activating an entry launches the app (`Shell.App.activate()`, falling back to
  `Gio.AppInfo.launch()`), closes the menu and hides the overview if visible.
- The whole enumeration is guarded in try/catch so a broken `.desktop` entry
  cannot crash `create()`/`enable()`; if no apps are found, a single
  "No applications found" label is shown.

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

- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)
