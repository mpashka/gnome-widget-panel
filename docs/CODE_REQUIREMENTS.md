# Code requirements

`@tag:process`

What is specific to this repository's code. General code-quality criteria reach
agents on their first code edit; the project's own quality bar (modularity,
naming, per-widget docs, CPU cost) is [`process/code-quality.md`](process/code-quality.md).
Back to the [documentation index](index.md) and the [working rules](../AGENTS.md).

## Architecture invariants

The full design is [`implementation/architecture.md`](implementation/architecture.md);
these are the parts a change must not break.

- **One settings model.** All configuration lives in GSettings
  (`org.gnome.shell.extensions.floating-mini-panel`). The widget list is the
  `widgets` key — JSON `{"schema":1,"plugins":[{id,enabled,options}…]}`, array
  order = panel order, empty key = `defaultWidgetConfig()`. Any preferences UI
  edits this same schema; never introduce a second settings model. Unknown
  enabled IDs throw rather than silently load code.
- **Plugin contract.** A plugin is `extension-src/plugins/<id>/index.ts`
  exporting `create(parent, options)` that returns a Clutter/St actor with
  `destroy()`, registered in `REGISTRY` in `pluginManager.ts`. Widget-local
  helpers live next to its `index.ts`.
- **Lifecycle (Shell 50).** `destroy()` releases every timer, signal,
  `Soup.Server` and child process.
- **Collection belongs to the extension, never to a widget.**
  [`aiCollector.ts`](../extension-src/aiCollector.ts) owns the localhost server,
  Claude's hooks and the helper processes; `ai-agent-usage` and
  `ai-agent-status` are views of it, switched by the `ai-collector` key, not by
  the widget list. Do not move collection back into a widget or give a widget a
  second one. The collector keeps raw truth (pruned only at a fixed 24 h bound);
  freshness, open-session and sampling policy are the widget's settings. History
  is kept separately per provider, and a merged segment keeps the identity and
  colour of the provider that won it. Why:
  [`implementation/ai-collector.md`](implementation/ai-collector.md).

## TypeScript contract typing

Runtime files carry `// @ts-nocheck` (dynamic GObject and private Shell APIs;
`strict` is off) — intentional, migrated incrementally. Every change that
touches one of these contracts adds or improves its types **in the same
change**:

- widget configuration and its parsed/validated representation;
- the plugin registry, plugin module and `create(parent, options)` lifecycle;
- shared host/plugin context, parent and returned actor/lifecycle handles;
- AI provider input payloads, normalized provider state, freshness metadata;
- per-provider history, merged display samples, provider identity and colours;
- Codex helper JSON Lines messages and Claude statusLine HTTP payloads.

Shared contract types go to dedicated modules (`contracts.ts`), not inline
object shapes. Validate untrusted JSON at runtime before treating it as typed.
Drop `// @ts-nocheck` from a file once its boundaries are typed. Update
[`roadmap/backlog.md`](roadmap/backlog.md) when a contract is completed, split
or newly discovered.

## Code formatting

EGO reviewers read the **generated** `extension/*.js`, so it must be readable:
**two blank lines between functions**, **three between classes** (including
`GObject.registerClass(...)` assignments), and a blank line after the grouped
import block. Apply it to the TypeScript you touch — but `tsc` strips blank
lines, so the build runs a post-processor after `tsc` (`./gwp build`) that
reinserts them. When you change the build or the emitted layout, keep that
step working and check the built `extension/*.js`.

## No synchronous I/O on the Shell thread

EGO forbids it. Never call sync file APIs (`GLib.file_get_contents` /
`file_set_contents`, `Gio.File` `load_contents` / `replace_contents`,
`query_exists`, sync `enumerate_children`, `GLib.spawn_command_line_sync`, …)
from code the Shell loads. Use the async variants (`Gio._promisify`, then
`await`); long or blocking work goes to the out-of-process helpers
(`helpers/*.ts`, embedded hook scripts), which may use sync calls. `destroy()`
cannot `await`: fire best-effort async cleanup and do not block teardown.

## Which suite a change needs

- `npm test` — the **gi-free** pure-logic modules only
  ([`tests/`](../tests/index.md)). Prefer extracting pure logic into a gi-free
  module and testing it there over loading Shell-only code.
- `npm run test:ui` — panel layout, live-apply settings, clicks
  ([`testing/ui-testing.md`](testing/ui-testing.md)).
- `npm run test:prefs` — after touching `prefs.ts`, a widget's `prefs.ts` or a
  shared row builder ([`tests/prefs/`](../tests/prefs/index.md)): a page that
  throws is swallowed by the subpage loader, and the only symptom is a settings
  button that does nothing.
- `npm run check:ego` — the EGO checker, before a release upload.
- Shell-only behaviour is verified by running it: `./gwp dev` (nested shell, no
  logout — [`process/development.md`](process/development.md)).

## Tags in code

Where the token goes: `.claude/rules/llm-wiki-tags/code-tags-typescript.md` and
`code-tags-shell.md` (loaded by path). Tag the source in `extension-src/`, never
the generated `extension/`.
