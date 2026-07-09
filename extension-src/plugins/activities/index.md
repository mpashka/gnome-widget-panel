# Gnome Action widget

`@tag:widget-activities`

Back to [plugins index](../index.md).

## Purpose

A clickable panel button that runs a configurable **GNOME shell action** on
click. This widget was previously the "Activities" button; it is now the more
general "Gnome Action" widget.

**Internal id kept for backward compatibility.** The plugin id stays
`activities` (the directory is still `activities/`, and the `pluginManager.ts`
registry key is still `activities`), so existing user configs in
`widgets.json` and the bundled default config keep working unchanged. Only the
user-facing **label** changed from "Activities" to "Gnome Action".

The default action is `overview`, which reproduces the historical
Activities-button behaviour exactly, so widgets created before the `action`
option existed behave identically.

## Actions

- `overview` (default) — Windows overview: `Main.overview.show()` /
  `hide()`. This is the tiled window picker for the current workspace. GNOME's
  overview shows the workspace thumbnails **together with** the tiled open
  windows, so this action covers both "running apps tiled" and "desktops". See
  the caveat below.
- `apps` — All-applications grid via `Main.overview.showApps()`.
- `show-desktop` — Minimize all windows (a plain show-desktop): iterates
  `global.get_window_actors()` and calls `minimize()` on every minimizable,
  non-minimized window. It does not toggle or restore — a second click does not
  bring windows back. Each window is feature-checked and guarded because
  `can_minimize()`/`minimized` differ across Shell builds.

Every action runs inside a `try/catch`; a click can never throw. A throw in
`create()` would disable the whole extension, so the option parsing and button
construction are guarded too.

### Caveat: no separate "desktops/workspaces" action

GNOME Shell has no first-class, stable action that opens a workspaces-only
"expo" view separate from the overview: the overview already shows workspace
thumbnails alongside the tiled windows. Rather than invent an unstable
workspaces-only API, no `workspaces` action is provided; use `overview`, which
already presents both windows and workspace thumbnails together.

## Options

- `action` — which GNOME action the button runs: `overview` (default), `apps`,
  or `show-desktop`. Edited in `prefs.ts` via an `Adw.ComboRow`.
- `icon` — symbolic icon name shown on the button. When unset it falls back to
  a per-action default (`overview` → `focus-windows-symbolic`, `apps` →
  `view-app-grid-symbolic`, `show-desktop` → `user-desktop-symbolic`). Edited
  in `prefs.ts` via the shared searchable icon picker
  ([`../iconPicker.ts`](../iconPicker.ts)), which shows the actual icon and
  lets you search the theme or type a name.
- `text` — optional text label shown next to (or instead of) the icon.
  Defaults to empty (icon only). Clearing both icon and text is not
  recommended; the button then falls back to its default icon.

## Source files

- `index.ts` — plugin entrypoint; builds the `St.Button` and wires the click to
  the selected action in a guarded switch.
- `prefs.ts` — per-widget settings UI: an `Adw.ComboRow` for `action`, an
  icon-picker row for `icon` (see [`../iconPicker.ts`](../iconPicker.ts)) and an
  `Adw.EntryRow` for `text`.
- Shared button content is built by
  [`../panelButtonContent.ts`](../panelButtonContent.ts).

## Related docs

- [Object model](../../../docs/object-model.md)
- [Architecture](../../../docs/architecture.md)
