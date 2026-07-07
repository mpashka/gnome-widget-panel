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

The single "Widgets" page edits `~/.config/gnome-widget-panel/widgets.json`
directly — the configuration file stays the source of truth, there is no second
settings model. Actions:

- **Enable / disable** a widget with the per-row switch.
- **Reorder** widgets with the up/down buttons; array order defines panel order.
- **Remove** a configured widget.
- **Add** a widget from the "Add a widget" group, which lists every known widget
  not already present.
- **Configure** a widget: rows whose widget declares `hasPreferences: true` show
  a settings button that opens that widget's own settings dialog.

Every change is written immediately. Reload GNOME Shell (log out and back in on
Wayland) to apply changes to the running panel.

## Panel page

A second **Panel** page exposes panel-level settings that used to live in the
control-button context menu (which now only keeps **Settings…**; all other panel
control is via mouse gestures on the panel handle). It edits the panel
`GSettings` (`this.getSettings()`), not `widgets.json`, and both settings are
applied **live** to the running panel — no reload needed.

- **Auto position** — an `Adw.ComboRow` of the six presets the old menu offered
  (Top/Bottom × Start/Center/End). Selecting one writes the `aligned` int
  bitfield (`NONE 0, TOP 1, BOTTOM 2, LEFT 4, RIGHT 8, CENTER 16`). The running
  `FloatingMiniPanel` listens on `changed::aligned` and calls `_relocate(false)`.
  Dragging the panel by hand writes a custom `aligned` value that matches no
  preset; the combo then shows no selection until a preset is picked again.
- **Orientation** — an `Adw.SwitchRow` bound to the `vertical` bool via
  `settings.bind('vertical', row, 'active', Gio.SettingsBindFlags.DEFAULT)`. The
  panel listens on `changed::vertical` and re-applies its layout/pseudo-classes
  (`FloatingMiniPanel._setOrientation`) then relocates.

Gestures on the panel handle stay the primary interaction and keep working
exactly as before (left = app grid, middle = drawer toggle, right = menu;
Shift/Ctrl click variants snap alignment; long-press moves / toggles orientation
/ hides for 5 s).

## How per-widget settings work

Preferences run in a separate process from GNOME Shell, so they cannot import
the Shell-only plugin modules. The pieces:

- [`../extension-src/contracts.ts`](../extension-src/contracts.ts) — typed
  contracts: `WidgetConfig`, `PluginConfig`, `PluginDescriptor`,
  `PluginPreferencesModule`, `WidgetPreferencesContext`.
- [`../extension-src/configStore.ts`](../extension-src/configStore.ts) — the only
  place that reads, validates and writes `widgets.json`.
- [`../extension-src/plugins/registry.ts`](../extension-src/plugins/registry.ts)
  — process-independent metadata (label, description, `hasPreferences`) plus a
  lazy `loadPreferences()` importer. It imports no `gi://`/`resource://` module.
- A widget with settings provides `plugins/<id>/prefs.ts` exporting
  `fillWidgetPreferences(context)`; it fills an `Adw.PreferencesDialog` and calls
  `context.save(options)` to persist its `options` object back into
  `widgets.json`. Widgets with settings today: `ai-agent-usage`,
  `cpu-load-monitor` and `clock`.

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

Back to the [docs index](index.md) and
[architecture](architecture.md).
