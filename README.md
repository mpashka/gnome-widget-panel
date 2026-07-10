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

Plugin order, enabled state and per-widget options are configured in the
`widgets` GSettings key (schema
`org.gnome.shell.extensions.floating-mini-panel`); an empty key falls back to
the built-in default configuration. Changes apply live, no reload needed (see
[`docs/preferences.md`](docs/preferences.md)).

## Configure widgets

Open the preferences UI to add, remove, reorder, enable and configure widgets:

```bash
gnome-extensions prefs gnome-widget-panel@mpashka.github.com
```

Widgets that have their own settings (currently `ai-agent-usage`) show a settings
button that opens the widget's own settings dialog. The UI edits the same
`widgets` GSettings key; you can also edit it by hand with `gsettings`. See
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

## Reload without logout (developer install)

`install.sh` needs a logout/login on Wayland to take effect. For fast iteration
use the developer workflow instead:

```bash
sudo apt install mutter-dev-bin   # one-time: provides gnome-shell --devkit
./dev-install.sh                  # one-time: symlink the build tree into the extensions dir
./dev-run.sh                      # rebuild and run a nested GNOME Shell window
```

Edit sources, close the nested window (or press `Ctrl+C`), and rerun
`./dev-run.sh` to reload — no logout of your real session. `dev-run.sh` disables
the extension in your main session, then runs an interactive nested GNOME Shell
in a window (`gnome-shell --devkit`) with the extension enabled in an isolated
dconf profile, and tails the log. See
[`docs/development.md`](docs/development.md) for details and alternatives.

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
