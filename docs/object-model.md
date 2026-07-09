# Object model

`@tag:ui` `@tag:mechanism`

The project is authored in TypeScript under `extension-src/`. The build step
transpiles it to GJS-compatible JavaScript under `extension/`; only generated
JavaScript is installed into GNOME Shell.

## Build-time layout

- `extension-src/` — source of truth for TypeScript and static extension assets.
- `extension/` — generated install tree. Do not edit it directly; run
  `npm run build`.
- `build.sh` — recreates `extension/`, copies static assets, then runs `tsc`.
- `install.sh` — installs npm dependencies if needed, builds, then copies the
  generated extension to
  `~/.local/share/gnome-shell/extensions/gnome-widget-panel@mpashka.github.com`.

The current migration intentionally keeps `// @ts-nocheck` in runtime files
because the panel uses many dynamic GObject fields and private GNOME Shell
objects. TypeScript is now the source format and build pipeline; strict typing
should be introduced incrementally around stable contracts first.

## Runtime objects

### `FloatingMiniPanelExtension`

GNOME Shell extension entrypoint. It owns enable/disable lifecycle and creates a
single `FloatingMiniPanel` instance.

### `FloatingMiniPanel`

Main panel actor. It owns:

- panel positioning and relocation. On startup the constructor restores the raw
  `pos-x`/`pos-y` and then calls `_relocate(false)` so the saved `aligned`
  preset (edge snapping / centering) is re-applied after a reload. When
  `aligned === NONE` the panel keeps its exact stored (floating) position across
  restarts; only out-of-bounds positions are clamped back on screen;
- auto/permanent/off state;
- top-panel hiding integration;
- GNOME Shell quick settings toggle;
- control button;
- configured plugin actors returned by `PluginManager`.

It also **live-reloads its widgets** when `widgets.json` changes (edited directly
or through the settings UI), so per-widget settings and add/remove/reorder/enable
changes apply without a full GNOME Shell reload. A `Gio.FileMonitor` on the
config directory (`~/.config/gnome-widget-panel/`) feeds a ~300 ms debounced
timer that calls `_reloadPlugins()`. `_reloadPlugins()` builds the new plugin
instances first and only swaps them in on success, so an invalid or half-written
config keeps the current widgets. Because new actors are constructed before the
old ones are destroyed, a widget owning an exclusive resource (e.g.
`ai-agent-usage`'s localhost `Soup.Server`) briefly overlaps with its old
instance; the handled bind error is non-fatal and the next sample recovers. The
monitor, its signal and the debounce timer are released in `destroy()`.

Every timer, signal, child actor and compositor override must be released in
`destroy()`.

### `PluginManager`

Reads `~/.config/gnome-widget-panel/widgets.json`, falling back to bundled
`extension/config/widgets.json`. The registry maps plugin IDs to
`extension-src/plugins/<plugin-id>/index.ts`.

Plugin `create(parent, options)` returns a GNOME Shell actor. Plugin order is
the order in the config file.

### `ControlButton`

The panel handle/menu button. It owns drag/move actions and long-press/click
gestures. Its context menu now holds only the "Settings…" item (which opens the
preferences window) with no separator above it; the former Auto-Position and
Control-Functions menu sections were moved to the preferences "Panel" page, while
the equivalent mouse gestures still work.

Gesture notes:

- A plain left click on the handle is a no-op (it no longer toggles the overview
  or app grid); use a dedicated activities/gnome-menu widget for that.
- A plain right click reliably opens/closes the context menu every time. It
  snapshots the menu's open state on button press and toggles from that snapshot,
  avoiding a race with the panel menu-manager's `ClickGesture`, which closes an
  open menu on the same release.

### `IndicatorsDrawer`

Reusable wrapper for role-filtered clones of GNOME panel indicators. Used by:

- `keyboard-layout`;
- `app-notifications`.

### `cpu-load-monitor`

Plugin-local object: `CpuGraph`.

Reads `/proc/stat`, samples aggregate CPU load, reads CPU temperature from
thermal zones and paints a compact graph with normal/warm/hot colors.

### `clock`

Plugin-local object: `DateButton`.

Wraps GNOME Shell `dateMenu`, redirects its menu source actor to the floating
panel button while the plugin is mapped, and restores the original source actor
on unmap/destroy.

### `ubuntu-system-status`

Plugin-local object: `QuickButton`.

Wraps GNOME Shell `quickSettings`, clones visible indicators, redirects menu
source actor while mapped, and restores original quick settings behavior on
destroy.

### `ai-agent-usage`

Plugin-local object: `AiAgentUsageGraph`.

Owns in-memory provider state and rendering:

- Claude Code provider: the widget starts a localhost `Soup.Server`, generates a
  session secret, writes a thin `~/.claude/gnome-widget-panel-claude-hook.js`
  command hook and receives statusLine JSON over HTTP.
- Codex provider: the widget starts
  `plugins/ai-agent-usage/helpers/codex-usage-helper.js` as a `gjs -m` child
  process and reads stdout JSON Lines asynchronously.
- In-memory history must remain separate per provider (`codex`, `claude`,
  future providers). Rendering may merge histories into one visible graph, but
  each rendered segment must retain the winning provider identity and use that
  provider's configurable color.

No AI usage persistence/cache file is part of the active architecture.
