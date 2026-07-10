# Preferences UI

`@tag:ui` `@tag:mechanism`

The extension ships a GNOME preferences UI (`extension-src/prefs.ts`, built to
`extension/prefs.js`) for managing panel widgets. Open it with:

```bash
gnome-extensions prefs gnome-widget-panel@mpashka.github.com
```

or from the GNOME **Extensions** / **App** list via the widget panel's settings
button.

## What it does

Everything lives on a **single "Widgets" page**. The widget list edits the
`widgets` GSettings key directly — that key stays the source of truth, there is
no second settings model. The panel position and orientation groups on the same
page edit the same panel `GSettings` object (different keys). Actions:

- **Enable / disable** a widget with the per-row switch.
- **Reorder** widgets by **dragging with the mouse**. Each configured-widget
  `Adw.ActionRow` has a drag-handle prefix (`Gtk.Image`,
  `list-drag-handle-symbolic`) and mirrors GNOME's search/extension reorderable
  lists. A `Gtk.DragSource` (`Gdk.DragAction.MOVE`) on the row ships the source
  index as a boxed `GObject.TYPE_INT` value via
  `Gdk.ContentProvider.new_for_value`; a `Gtk.DropTarget.new(GObject.TYPE_INT,
  …)` on each row receives it and, on drop, splices the plugin out of the source
  index and back in at the target row's index, persists and rebuilds the list.
  Array order defines panel order. (The old up/down arrow buttons are gone.)
- **Remove** a configured widget.
- **Add** a widget with the **Add a widget…** `Adw.ButtonRow`
  (`list-add-symbolic`) in a group **below** the list — no longer a `+` in the
  group header and no popover. Activating it calls `window.push_subpage(...)` to
  open an in-window **"Add a widget"** subpage (an `Adw.NavigationPage` with an
  `Adw.ToolbarView` + `Adw.HeaderBar` and an `Adw.PreferencesPage` of activatable
  rows) listing only the widgets not already added. The list is rebuilt from the
  current config every time it opens, so an added widget never reappears —
  unless it is a **multi-instance** widget (`descriptor.multiInstance`, e.g.
  `launch`, `activities`), which stays in the list so it can be added several
  times, each instance with its own `options`. When nothing addable is left it
  shows an "All widgets added" empty row. Activating a row appends the widget,
  saves, and `window.pop_subpage()` back to the list.
- **Configure** a widget: rows whose widget declares `hasPreferences: true` show
  a settings button that opens that widget's own settings as an **in-window
  subpage** (not a dialog) — see below.
- **Request a widget…** — the top of the "Add a widget" subpage has a
  `Adw.ActionRow` that opens a prefilled GitHub **widget request** issue form
  (`widget_request.yml`) in the browser via `systemInfo.openUrl(
  systemInfo.widgetRequestUrl())`, for widgets that do not exist yet.

Widget changes are written immediately and applied **live**: the running
`FloatingMiniPanel` listens on `changed::widgets` and rebuilds its widgets
(per-widget settings plus add/remove/reorder/enable) after a short debounce —
no GNOME Shell reload or logout needed. See the `FloatingMiniPanel` live-reload
note in [`object-model.md`](object-model.md).

## Panel settings

A single **Panel layout** `Adw.PreferencesGroup` on the same page exposes the
panel-level settings that used to live in the control-button context menu (which
now keeps **Settings…**, **About** and **Report a bug**; all other panel control
is via mouse gestures on the panel handle). It edits the panel `GSettings`
(`this.getSettings()`) directly, using its own keys (not the `widgets` key), and
is applied **live** to the running panel — no reload needed. It has these rows:

- **Position** — an `Adw.ComboRow` whose first entry is
  **Floating (keep position)** (`aligned = 0`), followed by the six snap presets
  the old menu offered (Top/Bottom × Start/Center/End). Selecting one writes the
  `aligned` int bitfield (`NONE 0, TOP 1, BOTTOM 2, LEFT 4, RIGHT 8, CENTER 16`).
  The running `FloatingMiniPanel` listens on `changed::aligned` and calls
  `_relocate(false)`; `aligned === 0` keeps the exact dragged position with no
  snapping. `syncSelected` maps `aligned === 0` to the Floating row, so it shows
  as selected. Any other custom value that matches no preset leaves the combo
  unselected until a preset is picked again.
- **Orientation** — a single `Adw.ComboRow` bound to the single `orientation`
  GSettings **enum** key (`horizontal` / `left` / `right`, index == nick):
    - **Horizontal** → `orientation = 'horizontal'`.
    - **Vertical left** → `orientation = 'left'` (graphs rotate CCW, time
      bottom→top).
    - **Vertical right** → `orientation = 'right'` (graphs rotate CW, time
      top→bottom).

  The row shows short labels; the open dropdown shows long descriptions via a
  `Gtk.SignalListItemFactory`. On `notify::selected` it writes the matching nick
  (guarded so programmatic syncs don't re-write), and `changed::orientation`
  syncs the row back. The panel listens on `changed::orientation`: it derives
  `{vertical, rotation}` from the enum (`_orientationState()`), re-applies its
  layout/pseudo-classes (`FloatingMiniPanel._setOrientation`), rotates the graph
  widgets 90° by pushing `{vertical, rotation}` to every plugin that implements
  `setPanelLayout(...)` (the cpu and ai graphs) — on startup and on the change —
  then relocates. (This single enum replaces the former separate `vertical` bool
  and `vertical-rotation` int; the control-button orientation gesture also just
  writes this one key.)
- **Content padding** — an `Adw.SpinRow` for `content-padding`. User changes are
  written explicitly on `notify::value`, rounded to whole pixels, and external
  `changed::content-padding` updates sync the row back to the stored value.

Gestures on the panel handle stay the primary interaction and keep working
exactly as before (left = app grid, middle = drawer toggle, right = menu;
Shift/Ctrl click variants snap alignment; long-press moves / toggles orientation
/ hides for 5 s).

## Main panel (top bar)

A separate **Main panel (top bar)** `Adw.PreferencesGroup` (added by
`_addMainPanelGroup`) controls the GNOME Shell top bar independently of the
floating mini panel. One `Adw.ComboRow` (short labels in the row, long
descriptions in the open dropdown via a `Gtk.SignalListItemFactory`, exactly like
Orientation) is bound to the `main-panel` GSettings **enum** (index == nick):

- **Visible** → `main-panel = 'visible'` — leave the top bar untouched.
- **Auto hide** → `main-panel = 'autohide'` — hide it, slide it in on a top-edge
  pressure barrier and while the overview is open.
- **Hidden** → `main-panel = 'hide'` — keep it hidden.

It is applied **live** by the `MainPanelController` (the panel listens on
`changed::main-panel`), which reimplements the core of the standalone **Hide Top
Bar** extension (see [`object-model.md`](object-model.md)). Because both would
fight over `panelBox`, the group also detects Hide Top Bar
(`hidetopbar@mathieu.bidon.ca`) from the preferences process — which has no
`ExtensionManager` — by reading `org.gnome.shell`'s `enabled-extensions` /
`disabled-extensions` / `disable-user-extensions` keys plus the extension
directories (`_hideTopBarStatus`):

- **enabled** (actively controlling the bar): shows an `error`-styled warning row
  and **disables** the combo (our controller stands down while it runs, so the
  setting is meaningless);
- **installed but disabled**: shows a softer `warning` row noting it can be
  removed, and leaves the combo usable.

## About and GitHub issue integration

An **About** `Adw.PreferencesGroup` sits at the bottom of the main page (added by
`_addAboutGroup`). It is also the target of the control-button **About** menu
item: `openAbout()` on the `Extension` simply calls `openPreferences()` (jumping
straight to an About subpage from the Shell process is not reliably supported),
so the About group is always reachable there. Rows:

- **Name + version** (`this.metadata.name` / the human-readable
  `this.metadata['version-name'] ?? this.metadata.version`, so it shows `0.1.0`
  rather than the integer EGO version code — see [Versioning](../TODO.md#versioning))
  with an external-link button opening `systemInfo.repoUrl` (the GitHub repository).
- **Report a bug** → `systemInfo.openUrl(systemInfo.bugReportUrl())` — opens the
  `bug_report.yml` issue form prefilled with `collectSystemInfo()` in the
  form's `system` field. The control-button context menu also has a **Report a
  bug** item that calls the same `systemInfo.openUrl(systemInfo.bugReportUrl())`
  directly from the Shell process (`controlButton.ts`).
- **Suggest a feature** → `featureRequestUrl()` (`feature_request.yml`).
- **Roadmap** → `systemInfo.roadmapUrl`
  (`…/issues?q=is%3Aissue+label%3Aroadmap`); voting is via GitHub reactions.

All of this is built by the shared
[`../extension-src/systemInfo.ts`](../extension-src/systemInfo.ts), which runs in
the preferences process too. `collectSystemInfo()` is best-effort and never
throws: extension version (from `metadata.json`), GNOME Shell version
(`Config.PACKAGE_VERSION` in the Shell, else `gnome-shell --version`), OS/distro
(`/etc/os-release` `PRETTY_NAME`), kernel (`uname -sr` / `/proc/sys/kernel/osrelease`),
session type (`XDG_SESSION_TYPE`) and Wayland/X11. The issue forms live in
[`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE) (`bug_report.yml`,
`feature_request.yml`, `widget_request.yml`, `config.yml`); the `template=<file>`
names in `systemInfo.ts` match those filenames.

Note: GitHub issue forms cannot pre-attach an image via URL — the bug form has a
**Screenshots** area where users drag and drop image files manually.

## How per-widget settings work

Preferences run in a separate process from GNOME Shell, so they cannot import
the Shell-only plugin modules. The pieces:

- [`../extension-src/contracts.ts`](../extension-src/contracts.ts) — typed
  contracts: `WidgetConfig`, `PluginConfig`, `PluginDescriptor`,
  `PluginPreferencesModule`, `WidgetPreferencesContext`.
- [`../extension-src/configStore.ts`](../extension-src/configStore.ts) — the only
  place that reads and writes the `widgets` GSettings key (parsing/validation
  lives in the gi-free `widgetConfig.ts`).
- [`../extension-src/plugins/registry.ts`](../extension-src/plugins/registry.ts)
  — process-independent metadata (label, description, `hasPreferences`) plus a
  lazy `loadPreferences()` importer. It imports no `gi://`/`resource://` module.
- A widget with settings provides `plugins/<id>/prefs.ts` exporting
  `fillWidgetPreferences(context)`; it calls `context.window.add(page)` with its
  `Adw.PreferencesPage` and `context.save(options)` to persist its `options`
  object back into the `widgets` GSettings key. Widgets with settings today:
  `ai-agent-usage`, `cpu-load-monitor` and `clock`.

The widget settings now open as an **in-window subpage**, not an
`Adw.PreferencesDialog`. `_openWidgetPreferences` builds an `Adw.NavigationPage`
whose child is an `Adw.ToolbarView` + `Adw.HeaderBar` (so it gets the widget
title and a working back button). The `context.window` handed to the widget is a
small **shim** object whose `.add(page)` routes the widget's `Adw.PreferencesPage`
into the toolbar's content (`toolbar.set_content(page)`). After the widget fills
it, the subpage is pushed with `window.push_subpage(...)`. `context.save` is
unchanged (persist to the `widgets` GSettings key), and the lazy
`descriptor.loadPreferences()` import stays. This keeps the widget-prefs contract
(`context.window.add(page)` + `context.save(options)`) intact.

Shell-side instantiation is unchanged: `pluginManager.ts` still maps ids to the
Shell plugin modules and calls `create(parent, options)`.

## Configuring providers (ai-agent-usage)

The `ai-agent-usage` settings page shows each provider with a status dot and a
graph-colour button:

- **green** — configured/found, **red** — found but not configured, **grey** —
  not found on this system.
- **Claude Code** has a **Configure** button. Because preferences run outside the
  Shell, the shared
  [`plugins/ai-agent-usage/claudeHook.ts`](../extension-src/plugins/ai-agent-usage/claudeHook.ts)
  performs the file operations from either process: Configure writes the hook and
  points `~/.claude/settings.json` at it, persisting a hook secret and port into
  the widget options so the running widget (after reload) uses the same secret.
  `configStatus()` drives the dot colour.
- **Codex** needs no per-user setup; its dot is green when `~/.codex/sessions`
  exists.

Provider colours colour the matching graph columns; the usage/window indicator
colours colour both the vertical bars and the matching tooltip icons.

## Templated tooltips with live preview

Widgets with a hover tooltip (`cpu-load-monitor`, `ai-agent-usage`) expose a
user-editable **tooltip template** in their settings page. The Tooltip group has
a multi-line `Gtk.TextView` for the template plus a live `Gtk.Label` **preview**
that re-renders as you type, so you can see the result without reloading the
Shell. Invalid Pango markup shows an inline error hint instead of crashing.

The template is a string with `{token}` placeholders; each widget substitutes
ready-built coloured markup fragments for its tokens via the shared
[`../extension-src/tooltipTemplate.ts`](../extension-src/tooltipTemplate.ts)
`renderTemplate` (no `gi://` import, so it runs in both processes). Literal text
between tokens is Pango-escaped, `\n` is a line break, and unknown tokens render
empty. Tokens per widget are listed in each widget's `index.md`
([cpu-load-monitor](../extension-src/plugins/cpu-load-monitor/index.md),
[ai-agent-usage](../extension-src/plugins/ai-agent-usage/index.md)); the template
persists to the widget's `options.template`. Other tooltip toggles still apply at
render time (cpu "Show tooltip"; ai "Show recent requests" / "Request preview
length" drive the `{requests}` token).

## Searchable icon picker

The button widgets (`gnome-menu`, `activities`, `favorites`) let you pick their
icon visually instead of typing a name. Each settings page shows an
`Adw.ActionRow` whose prefix is the **actual selected icon** (a `Gtk.Image`, not
just its mnemonic name) and a **Choose…** button. The button opens a searchable
chooser (an `Adw.Dialog` with a `Gtk.SearchEntry` over a scrolling
`Gtk.FlowBox`) listing icons from the display icon theme
(`Gtk.IconTheme.get_for_display`). The theme is huge, so results are bounded:
the grid stays empty until at least two characters are typed and renders at most
the first 300 matches. A custom-name entry still lets you type an arbitrary icon
name (themes differ), applied on activate. Picking updates the row preview,
persists `options.icon` and closes the dialog. Implemented in the shared
[`../extension-src/plugins/iconPicker.ts`](../extension-src/plugins/iconPicker.ts).

Back to the [docs index](index.md) and
[architecture](architecture.md).
