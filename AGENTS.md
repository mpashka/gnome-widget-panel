# AGENTS.md

Reusable GNOME Shell floating panel and widget host. Read `README.md` and
`docs/*.md`. Provider collection that can block stays outside Shell. The
`ai-agent-usage` plugin is GJS-only: Claude statusLine posts to a localhost HTTP
server owned by the widget and Codex JSONL parsing runs in a managed GJS child
process. Never execute unreviewed generated code. Target Shell 50; avoid
blocking I/O and release every timer, signal, server and child process in
`destroy()`.

Current built-ins are registered in `extension/pluginManager.js`, ordered by
`extension/config/widgets.json`, and stored as
`extension/plugins/<plugin-id>/index.js` plus widget-local helper files. Keep the
user config file as the source of truth; future preferences UI must edit the
same schema rather than create a second settings model.

For `ai-agent-usage`, keep in-memory history separately per provider
(`codex`, `claude`, future providers) rather than storing only the merged graph.
Rendering may merge provider histories into one visible graph, but each rendered
segment must retain the provider identity that won that sample. Provider colors
must be configurable: if Codex has the highest token consumption for a sample,
draw that graph segment with the Codex color; if Claude wins, draw it with the
Claude color.
