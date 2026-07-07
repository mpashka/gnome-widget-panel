# TODO

Project backlog and the definition of the next architectural work. Keep this
list current when implementing or discovering stable contracts.

## Type stable contracts

- [x] Define and runtime-validate the widget configuration schema, including
  plugin IDs, enabled state, ordering and typed plugin options
  (`contracts.ts` + `configStore.ts`).
- [x] Define the plugin registry/module contract and the
  `create(parent, options)` lifecycle API (`contracts.ts` +
  `plugins/registry.ts`); `pluginManager.ts` stays `// @ts-nocheck` for now.
- [ ] Define shared host/plugin context, parent actor and returned
  actor/disposable handles.
- [ ] Define AI provider identifiers, normalized usage state, timestamps,
  freshness rules, context-window usage and server-limit usage.
- [ ] Store and type histories separately per provider; define the merge result
  with provider identity retained on every displayed sample.
- [ ] Define configurable provider-color types and validated defaults.
- [ ] Define and validate the Codex helper JSON Lines protocol.
- [ ] Define and validate Claude statusLine payloads and the local HTTP
  request/response protocol.
- [ ] Remove `// @ts-nocheck` incrementally as the affected file boundaries
  become typed.
- [ ] Enable stricter TypeScript compiler options once the stable boundaries
  above no longer depend on unchecked values.

When code touches an item above, its types and runtime validation are part of
that change, not a separate cleanup task.

## Panel roadmap

- [ ] Add explicit Apps and Places menu plugins.
- [ ] Add a dedicated “Show all applications” button plugin.
- [ ] Support installing versioned plugins from external repositories.
- [ ] Add a repository catalog with provenance, compatibility and permission
  data.
- [x] Add UI for adding, removing, ordering, enabling and configuring plugins
  (`prefs.ts`); searching external repositories is still pending.
- [x] Keep file configuration as the declarative source of truth beneath the
  UI (the preferences UI edits `widgets.json` via `configStore.ts`).
- [ ] Isolate plugin failures and provide rollback to the previous pinned
  revision.
