# GNOME Widget Panel

Compact floating panel for Ubuntu/GNOME, inspired by XFCE panel widgets.
Independent widget repositories provide a manifest and GJS renderer. The first
integration target is `ai-agent-usage-widget`.

The repository now contains the working Floating Mini Panel based implementation
under `extension/`, split into configured built-in plugins.

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
`extension/config/widgets.json`. Edit the user file and reload GNOME Shell
(logout/login on Wayland) to apply changes.

## Install development build

```bash
./install.sh
```

The new extension uses UUID `gnome-widget-panel@mpashka.github.com`; it can be
tested without overwriting the previously installed Floating Mini Panel.

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
  provider limit usage into the compact panel graph.
