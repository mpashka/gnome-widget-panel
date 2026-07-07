# Architecture

```text
widget repositories → reviewed installer/registry → GNOME Shell host
                              ↑                         ↓
                     managed collectors          in-memory state
```

The host owns positioning, order, lifecycle and error isolation. A repository
provides `gnome-widget.json`, a GJS `createWidget(context)` entrypoint and
optional out-of-process collectors. Installations pin a revision and display
permissions before activation. Broken widgets are disabled independently.

Installed widgets live below
`~/.local/share/gnome-widget-panel/widgets/<id>/`.

## Current implementation

`extension-src/` is based on Floating Mini Panel v8, already patched for GNOME
Shell 50, compact 20 px layout, free positioning, normal-weight labels and the
local CPU monitor. `npm run build` generates installable GJS modules under
`extension/`. The host reads `~/.config/gnome-widget-panel/widgets.json`,
falling back to `extension/config/widgets.json`.

The configuration is an ordered list. `enabled: false` disables a plugin; array
order defines panel order. Unknown enabled plugin IDs fail explicitly instead of
silently loading unexpected code.

Built-in plugins live in separate directories below `extension-src/plugins/`;
each directory has an `index.ts` entrypoint and keeps widget-specific helpers
next to it. Generated files appear in matching `extension/plugins/`
directories. `pluginManager.ts` is the registry and lifecycle entry point.
Application notifications and keyboard layout use role-filtered clones of GNOME
panel indicators. The keyboard plugin forces its role into the always-visible
area. Clock and Ubuntu system status wrap the existing DateMenu and
QuickSettings integration.

## AI agent usage widget

The active AI usage widget is a built-in plugin named `ai-agent-usage`; it lives
inside this repository rather than in a separate widget repository for now.

Claude Code uses a command hook because Claude statusLine invokes a command, not
an HTTP endpoint directly. The widget starts a localhost-only `Soup.Server`,
generates a per-session secret, writes
`~/.claude/gnome-widget-panel-claude-hook.js`, and updates
`~/.claude/settings.json` to call that hook. The hook is intentionally thin:
stdin JSON is posted to the widget HTTP endpoint and the HTTP response is printed
to stdout for Claude's status line. The widget stores Claude token data only in
memory.

Codex log parsing is isolated from GNOME Shell. The widget starts
`extension/plugins/ai-agent-usage/helpers/codex-usage-helper.js` as a `gjs -m`
child process through `Gio.Subprocess`; the helper recursively scans
`~/.codex/sessions/**/*.jsonl`, extracts the newest `token_count` event, and
streams normalized JSON Lines to stdout. For UI load, the helper uses
`last_token_usage` because Codex `total_token_usage` is cumulative for the
session and can exceed the context window by orders of magnitude. The cumulative
value is still exposed as `tokens.session_total` for diagnostics. The Shell
process only reads small stdout lines asynchronously.

Communication options considered for the Codex child process:

- stdout JSON Lines — chosen now; minimal moving parts, parent owns child
  lifecycle, no ports or files;
- Unix domain socket — useful for bidirectional protocol or multiple consumers,
  but requires socket path lifecycle and permissions;
- D-Bus session service — clean GNOME-native API and introspection, but more
  boilerplate than needed for one local producer;
- localhost HTTP/WebSocket — symmetric with Claude but adds another local port;
- cache file — robust across restarts, but explicitly not desired for the new
  in-memory widget architecture.

The UI has one graph. It receives updates from all active providers, picks the
fresh provider with the largest token count, then samples that provider's token
count, context-window usage and best available server-limit usage. The main
token graph applies an idle threshold first: samples below `minActiveTokens`
default to zero. Active samples are autoscaled against the maximum active token
count in a scale window that is twice the visible graph width. Codex
`token_count` events are counted only once; repeated reads of the same newest log
event do not keep the graph artificially high. The blue vertical bar remains
context-window usage, and the yellow vertical bar remains the best available
server/rate-limit usage.

## Roadmap

The maintained backlog, including incremental TypeScript contract typing and
future panel features, lives in [`../TODO.md`](../TODO.md).
