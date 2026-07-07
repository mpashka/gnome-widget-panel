# AGENTS.md

Reusable GNOME Shell floating panel and widget host. Read `README.md` and
`docs/*.md`. Source of truth is TypeScript in `extension-src/`; `extension/` is
generated JavaScript installed into GNOME Shell. Do not edit generated
`extension/*.js` directly; change `extension-src/**/*.ts` and run
`npm run build`. Provider collection that can block stays outside Shell. The
`ai-agent-usage` plugin is GJS-only: Claude statusLine posts to a localhost HTTP
server owned by the widget and Codex JSONL parsing runs in a managed GJS child
process. Never execute unreviewed generated code. Target Shell 50; avoid
blocking I/O and release every timer, signal, server and child process in
`destroy()`.

Current built-ins are registered in `extension-src/pluginManager.ts`, ordered by
`extension-src/config/widgets.json`, and stored as
`extension-src/plugins/<plugin-id>/index.ts` plus widget-local helper files. Keep
the user config file as the source of truth; future preferences UI must edit the
same schema rather than create a second settings model.

## TypeScript contract typing rules

Type stable contracts even while dynamic GNOME Shell implementation code remains
under `// @ts-nocheck`. Every change that touches one of these areas must add or
improve its TypeScript types in the same change; do not postpone newly exposed
contract typing:

- widget configuration and its parsed/validated representation;
- the plugin registry, plugin module and `create(parent, options)` lifecycle
  contract;
- shared host/plugin context, parent and returned actor/lifecycle handles;
- AI provider input payloads, normalized provider state and freshness metadata;
- per-provider history, merged display samples, provider identity and color
  configuration;
- Codex helper JSON Lines messages and Claude statusLine HTTP request/response
  payloads.

Put shared contract types in dedicated source modules rather than duplicating
inline object shapes. Validate untrusted JSON at runtime before treating it as a
typed value. Remove `// @ts-nocheck` incrementally from files whose relevant
boundaries have become typed. Update [`TODO.md`](TODO.md) when a contract is
completed, split, or newly discovered.

For `ai-agent-usage`, keep in-memory history separately per provider
(`codex`, `claude`, future providers) rather than storing only the merged graph.
Rendering may merge provider histories into one visible graph, but each rendered
segment must retain the provider identity that won that sample. Provider colors
must be configurable: if Codex has the highest token consumption for a sample,
draw that graph segment with the Codex color; if Claude wins, draw it with the
Claude color.

## LLM wiki documentation rules

Maintain documentation as an LLM-readable wiki:

1. Every meaningful directory must have an `index.md` explaining what lives
   there, which files are source of truth, and where to go next.
2. Index files describe directories and stable concepts, not long changelogs.
   Keep entries short and link to deeper pages.
3. Prefer many small pages over one large document. Put local object/plugin
   details next to the code they describe.
4. Keep bidirectional navigation: parent indexes link to child pages; child
   pages link back to the parent index and to related architecture docs.
5. When code moves, update the nearest `index.md`, `docs/object-model.md`, and
   any plugin-level description in the same change.
6. For generated output, author docs in `extension-src/` when possible so
   `npm run build` copies them into `extension/`.
7. Do not duplicate implementation details in multiple places. One page owns a
   detail; other pages link to it.
