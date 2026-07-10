# Built-in plugins index

`@tag:mechanism`

Built-in widgets for GNOME Widget Panel. Each widget lives in its own directory
and exposes `index.ts` with `create(parent, options)`. A widget may also expose
`prefs.ts` with `fillWidgetPreferences(context)` for its own settings UI; declare
that in [`registry.ts`](registry.ts) with `hasPreferences: true`.

- `registry.ts` — process-independent metadata (label, description,
  `hasPreferences`, lazy preferences loader) used by the preferences UI; see
  [`../../docs/preferences.md`](../../docs/preferences.md).
- `panelButtonContent.ts` — shared helper that builds the icon/label child for
  the clickable panel-button widgets (`gnome-menu`, `gnome-action`, `favorites`,
  `printscreen`, `launch`).
- `iconPicker.ts` — shared preferences helper (`@tag:ui`) that builds a
  searchable icon-chooser row for those same button widgets: it shows the actual
  selected icon and opens a search dialog over the display icon theme.

## Widgets

- [`keyboard-layout`](keyboard-layout/index.md) — GNOME keyboard layout
  indicator clone.
- [`app-notifications`](app-notifications/index.md) — application
  AppIndicator/tray notification area.
- [`cpu-load-monitor`](cpu-load-monitor/index.md) — compact CPU load graph with
  temperature-aware color.
- [`ai-agent-usage`](ai-agent-usage/index.md) — Codex/Claude Code token usage
  graph and context/limit indicators.
- [`ai-agent-status`](ai-agent-status/index.md) — per-session Claude Code
  status dots (waiting for you / busy / idle) fed by lifecycle hooks (not in
  the default config).
- [`clock`](clock/index.md) — GNOME date menu button adapted to the floating
  panel.
- [`ubuntu-system-status`](ubuntu-system-status/index.md) — Ubuntu quick
  settings indicators for Wi-Fi, sound, battery and related system state.
- [`gnome-menu`](gnome-menu/index.md) — button that opens the GNOME application
  grid.
- [`gnome-action`](gnome-action/index.md) — "Gnome Action" button that runs a
  configurable GNOME action (windows overview, all applications, show desktop);
  multi-instance. Formerly `activities`; that id still resolves via a
  backward-compat alias.
- [`favorites`](favorites/index.md) — button with a Places menu (Home, XDG user
  directories and GTK bookmarks).
- [`printscreen`](printscreen/index.md) — button that opens the GNOME
  interactive screenshot UI (disabled by default).
- [`launch`](launch/index.md) — button that launches a configured command
  (multi-instance; not in the default config).
- [`caffeine`](caffeine/index.md) — toggle button that manually inhibits the
  screensaver/suspend via `org.gnome.SessionManager` (not in the default
  config).
- [`break-timer`](break-timer/index.md) — Workrave-style micro/rest/daily
  activity-based rest-reminder progress bars (not in the default config).

Further per-widget settings work is tracked in
[`../../TODO.md`](../../TODO.md).

Back to [`extension-src`](../index.md) and
[`object model`](../../docs/object-model.md).
