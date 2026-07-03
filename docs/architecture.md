# Architecture

```text
widget repositories → reviewed installer/registry → GNOME Shell host
                              ↑                         ↓
                     user collectors              cache reads
```

The host owns positioning, order, lifecycle and error isolation. A repository
provides `gnome-widget.json`, a GJS `createWidget(context)` entrypoint and
optional out-of-process collectors. Installations pin a revision and display
permissions before activation. Broken widgets are disabled independently.

Installed widgets live below
`~/.local/share/gnome-widget-panel/widgets/<id>/`.

## Current implementation

`extension/` is based on Floating Mini Panel v8, already patched for GNOME Shell
50, compact 20 px layout, free positioning, normal-weight labels and the local
CPU monitor. The host reads `~/.config/gnome-widget-panel/widgets.json`, falling
back to `extension/config/widgets.json`.

The configuration is an ordered list. `enabled: false` disables a plugin; array
order defines panel order. Unknown enabled plugin IDs fail explicitly instead of
silently loading unexpected code.

Built-in plugin modules live in `extension/plugins/`. `pluginManager.js` is the
registry and lifecycle entry point. Application notifications and keyboard
layout use role-filtered clones of GNOME panel indicators. The keyboard plugin
forces its role into the always-visible area. Clock and Ubuntu system status
wrap the existing DateMenu and QuickSettings integration.

## Roadmap

- add explicit Apps and Places menu plugins;
- add a dedicated “Show all applications” button plugin;
- support installing versioned plugins from external repositories;
- add a repository catalog with provenance, compatibility and permission data;
- add UI for searching, adding, removing, ordering and configuring plugins;
- retain file configuration as the declarative source of truth beneath the UI;
- isolate plugin failures and provide rollback to the previous pinned revision.
