# gnome-menu widget

`@tag:widget-gnome-menu`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that opens a categorized applications menu, like the
XFCE Whisker menu or the classic Windows Start menu: a search box above a LEFT
column of category names and a RIGHT column showing the applications of the
selected category — or the applications matching the search — rather than
opening the GNOME app grid.

## Behavior

- The button owns a `PopupMenu.PopupMenu` anchored to it (added to
  `Main.uiGroup`, registered with `Main.panel.menuManager`); clicking toggles
  the menu, and `destroy()` tears the menu down.
- Menu contents are built in the constructor and rebuilt when the world changes
  (see "The menu keeps itself current" below). Installed apps are
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
- **Search.** The box above the panes takes the key focus every time the menu
  opens, so the menu is usable by typing alone. While it holds text it owns the
  right pane: `matchApps` (see `appSearch.ts`) lists what matches across **all**
  categories, best first and capped at 50 rows, and no category is marked
  selected. Every word of the query must be found, in any order. `Enter`
  launches the top row, `↓` moves the keyboard into the list, `Escape` clears
  the query and then closes the menu; clearing the box or picking a category
  returns to browsing. `_render()` is the only writer of the right pane, so the
  two modes cannot disagree about what it shows.
- **Both languages.** An application is matched against every name it carries:
  the translated name shown in the menu, the **untranslated** `.desktop` `Name`
  and `GenericName` (`appInfo.get_string()` reads the key without translation,
  unlike `get_display_name()`), the localized generic name and keywords, the
  executable and the desktop id. So a Russian desktop finds "Настройки" by
  typing `settings`, and an English one the other way round. Terms are folded to
  lower case with accents dropped and `ё`/`й` merged into `е`/`и`, on both sides
  of the comparison.
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
- **Right-clicking an application row** opens that row's actions at the pointer
  (see [UX rules](../../../docs/process/ux.md)): the entry's own `.desktop`
  actions first ("New Window", "New Document", …), then **one** favorites item —
  *Add to Favorites* or *Remove from Favorites*, whichever applies — and
  *Edit Application…*. Editing copies a system entry into
  `~/.local/share/applications` (where it overrides the system one) and opens it
  with the `text/plain` handler; an existing user copy is opened untouched, and
  the system file is never written. `.desktop` files declare themselves as
  runnable, so the editor is resolved for `text/plain` — the file's own default
  handler would launch the application instead of opening it.
  - The actions are an ordinary actor **inside the popup**, positioned at the
    pointer and clamped to the popup's bounds. They cannot be a second
    `PopupMenu`: the panel's menu manager closes the applications menu on any
    press outside its actor, and a separate popup would be exactly that. For the
    same reason the dismissing press is caught on the content root
    (`_onRootEvent`) and swallowed, so the click that closes the actions never
    also launches the row it landed on; a right-click on **another** row is let
    through, so comparing two rows costs no extra click.
  - `global.stage.get_event_actor(event)` is what says where a press landed:
    `event.get_source()` is null for events delivered through the popup's grab.
- **The menu keeps itself current.** `installed-changed` (an application
  installed, removed or edited) and `changed::favorite-apps` rebuild it, once,
  `REBUILD_DELAY_MS` after the last signal of a burst. The rebuild keeps the
  selected category and the typed query, so an action taken inside the menu
  shows its result without the menu being reopened.
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
  enumerates and categorizes installed apps, runs the search box and the row
  actions, and launches apps on click.
- `appSearch.ts` — the gi-free search rules: text folding, the term list built
  from an application's names, and the ranked matching `index.ts` calls on every
  keystroke. Unit tested in
  [`../../../tests/appSearch.test.mjs`](../../../tests/index.md).
- `prefs.ts` — per-widget settings UI: an icon-picker row for `icon` (see
  [`../iconPicker.ts`](../iconPicker.ts)) and an `Adw.EntryRow` for `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [UX rules](../../../docs/process/ux.md) — the interaction bar this menu is
  the worked example of.
- [Object model](../../../docs/implementation/object-model.md)
- [Architecture](../../../docs/implementation/architecture.md)
