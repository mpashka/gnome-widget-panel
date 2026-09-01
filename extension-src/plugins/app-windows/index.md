# app-windows widget

`@tag:widget-app-windows`

Back to [plugins index](../index.md).

## Purpose

A panel button that lists the windows of the **application currently in focus**
by title. The shell's own Alt+Esc switcher identifies a window by a thumbnail,
which says nothing when several windows of the same IDE differ only by their
caption — and with many windows open the switcher no longer fits on screen.
This menu shows captions and nothing else.

The button carries the tracked application's own icon and its window count, so
it is clear whose windows the menu will list before it is opened.

## Behaviour

- **Tracked application** — `Shell.WindowTracker`'s `focus-app`. A **null**
  focus app is ignored rather than clearing the button: opening this very menu
  takes a shell grab, which drops the focus, and so do the overview and
  notifications. The tracked app is cleared only when its `windows-changed`
  reports it has no listed windows left.
- **Focused window** — tracked separately from `global.display`'s
  `notify::focus-window`, for the same reason: by the time the rows are built
  the popup's grab has already taken the focus, so `window.has_focus()` would
  claim no row is the one the user came from.
- **Listed windows** — everything the app owns except `skip_taskbar` windows
  (splash screens, tool windows).
- **Rows** — a fixed-width mark slot, the app icon, the window title
  (whitespace-collapsed, `Untitled window` when empty, ellipsized to the fixed
  menu width) and a dimmed suffix saying where the window is when that is not
  obvious: `minimised`, `workspace N`. The window that had focus is marked
  and is the only one whose mark is drawn (in `title` order it keeps its
  alphabetical place and only the mark moves).
- **Alignment** — the mark is **our own** child of a fixed size, with the
  shell's ornament slot hidden (`Ornament.HIDDEN`). The built-in ornament is an
  icon whose width differs between its dot and its empty state, so using it left
  the unmarked titles a few pixels left of the marked one; unmarked rows now
  carry the same actor at zero opacity and every title starts at the same x.
- **Order** — **by title (default)** or most recently used first.
  - `title` is a *stable* list: a window keeps its place between openings, so
    picking one becomes muscle memory — the point of a menu that exists to tell
    four windows of one application apart. The focused window is **not** hoisted;
    its mark is what says where you are.
  - `recent` is the switcher order (`get_user_time()`, newest first) with the
    focused window pulled to the front, since a window in use may carry an older
    user time than the one it was raised over. There the first row is always the
    window you came from, so the mark only repeats what the order said — which
    is why `title` is the default.
- **Limit** — at most `maxWindows` rows; the remainder is announced as
  "N more not shown" instead of growing the popup past the screen.
- **Activation** — `Main.activateWindow`, which switches workspace and
  unminimizes as needed.
- **Rebuilding** — the rows are rebuilt **before** every open (titles change
  constantly), from the button's `clicked` handler, and once in `_init`. Two
  shell behaviours dictate that timing:
  - `PopupMenu.open()` silently refuses to open an **empty** menu, so a menu
    that only fills itself afterwards never opens at all. `_rebuildMenu` always
    leaves at least the "No windows" notice, which satisfies that check.
  - Rebuilding from `open-state-changed`, or from `windows-changed` while the
    menu is open, destroys the very item the shell is working with — and
    `Shell.App` emits `windows-changed` from inside the activation a row just
    started, because activating a window changes its user time. The shell then
    trips over the disposed item and the menu never closes again. So the open
    menu is a snapshot; only the button is refreshed while it is up, and
    `_activate` re-checks that the chosen window still exists.

## Options

- `useAppIcon` — show the tracked application's own icon. Default `true`; with
  it off the button always shows `icon`.
- `icon` — the symbolic icon: the fallback under `useAppIcon` (until an
  application has been focused, or for a window-backed app with no desktop
  entry), the permanent icon otherwise. Default `focus-windows-symbolic`.
- `text` — optional text label next to the icon. Default empty.
- `showCount` — draw the number of windows as a **badge in the corner of the
  icon**, from two windows upwards. Default `true`. A badge rather than a second
  child: a child of its own widens the button, and in a vertical panel the
  widest child sets the whole strip's width.
- `template` — tooltip template rendered by the shared
  [`tooltipTemplate.ts`](../../tooltipTemplate.ts) with tokens `{app}`,
  `{count}` ("4 windows") and `{window}` (title of the focused window). Default
  `{app} — {count}`. **Empty means no tooltip** — that is the off switch, so
  there is no separate one. Fragments are Pango-escaped in
  `appWindowEntries.ts`, since a window title is outside text.
- `sort` — `title` (default, stable alphabetical) or `recent`.
- `maxWindows` — rows the menu lists, 1–50. Default 15.
- `menuWidth` — popup width in pixels, 180–900. Default 420.
- `otherWorkspaces` — list the app's windows on other workspaces too, marked
  with their workspace number. Default `true`.

Parsing, clamping and the defaults live in `appWindowEntries.ts`, so the
settings UI and the widget cannot drift apart.

## Source files

- `appWindowEntries.ts` — gi-free rules: option parsing/validation, ordering,
  limiting, row labels and the escaped tooltip fragments. Unit-tested in
  [`../../../tests/appWindowEntries.test.mjs`](../../../tests/appWindowEntries.test.mjs).
- `index.ts` — plugin entrypoint: the `St.Button`, focus tracking, the
  `PopupMenu` and window activation.
- `prefs.ts` — per-widget settings UI: application-icon switch, icon picker,
  text, count switch, order, limit, width, workspaces switch and the shared
  tooltip-template editor with a live preview.

## Tests

- [`../../../tests/appWindowEntries.test.mjs`](../../../tests/appWindowEntries.test.mjs)
  — the pure rules.
- [`../../../tests/ui/t-20-app-windows.sh`](../../../tests/ui/t-20-app-windows.sh)
  — the widget against three real GTK windows opened in the headless session by
  [`../../../tests/ui/window-client.js`](../../../tests/ui/window-client.js).

## Related docs

- [Widgets catalog](../../../docs/specification/widgets.md)
- [Object model](../../../docs/implementation/object-model.md)
