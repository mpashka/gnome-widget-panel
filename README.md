# GNOME Widget Panel

Compact floating panel for Ubuntu/GNOME, inspired by XFCE panel widgets.
Independent widget repositories provide a manifest and GJS renderer. The first
integration target is `ai-agent-usage-widget`.

The repository contains the working Floating Mini Panel based implementation as
TypeScript source under `extension-src/`, split into configured built-in
plugins. `npm run build` generates the installable GJS extension under
`extension/`.

## Current plugins

- `keyboard-layout`: GNOME keyboard layout indicator;
- `app-notifications`: application AppIndicator/tray notifications;
- `cpu-load-monitor`: compact CPU graph with temperature colors;
- `ai-agent-usage`: compact Codex/Claude Code token usage graph, context bar and
  limit bar;
- `clock`: GNOME clock/calendar button;
- `ubuntu-system-status`: Ubuntu Quick Settings indicators for Wi-Fi, sound,
  battery and related standard system state.

Plugin order and enabled state are configured in
`~/.config/gnome-widget-panel/widgets.json`. The bundled default is
`extension/config/widgets.json`. Reload GNOME Shell (logout/login on Wayland) to
apply changes.

## Configure widgets

Open the preferences UI to add, remove, reorder, enable and configure widgets:

```bash
gnome-extensions prefs gnome-widget-panel@mpashka.github.com
```

Widgets that have their own settings (currently `ai-agent-usage`) show a settings
button that opens the widget's own settings dialog. The UI edits the same
`widgets.json`; you can still edit that file by hand. See
[`docs/preferences.md`](docs/preferences.md).

## Install development build

```bash
./install.sh
```

`install.sh` installs npm dependencies if needed, runs `npm run build`, compiles
schemas and copies the generated `extension/` tree to the user GNOME Shell
extensions directory.

The new extension uses UUID `gnome-widget-panel@mpashka.github.com`; it can be
tested without overwriting the previously installed Floating Mini Panel.

## Development build

```bash
npm install
npm run build
npm run typecheck
```

Edit `extension-src/**/*.ts`; do not edit generated `extension/**/*.js`
directly. The current first TypeScript migration keeps runtime files under
`// @ts-nocheck` because this extension depends heavily on dynamic GObject and
private GNOME Shell APIs. Stable contracts should be typed incrementally.

## AI agent usage widget

`ai-agent-usage` is implemented inside this repository in GJS.

- Claude Code: if `~/.claude/` exists, the widget starts a localhost HTTP
  endpoint and writes `~/.claude/gnome-widget-panel-claude-hook.js`; Claude
  `statusLine` is updated to call this hook. The hook only forwards stdin to the
  widget and prints the returned status line. No cache file is used.
- Codex: the widget starts
  `extension/plugins/ai-agent-usage/helpers/codex-usage-helper.js` as a separate
  `gjs` child process. The helper parses `~/.codex/sessions/**/*.jsonl` and
  streams normalized JSON Lines over stdout.
- UI: one graph receives all provider updates, selects the fresh provider with
  the largest token consumption, and samples its token count, context usage and
  provider limit usage into the compact panel graph. Token samples below the
  idle threshold are drawn as zero; active samples are autoscaled against the
  maximum active token count in the recent scale window. Repeated reads of the
  same Codex `token_count` event are not treated as new consumption.
