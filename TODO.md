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

## Versioning

Two version fields live in `extension-src/metadata.json`:

- `version` — an **integer**, the extensions.gnome.org (EGO) version *code*. It
  must stay an integer and increments by one on every EGO upload. It is `1`
  before the first publication.
- `version-name` — a human-readable semver **string** (currently `"0.1.0"`).

Release policy:

- **alpha `0.x.y`** now (pre-publication / early testing).
- becomes **beta** once published on extensions.gnome.org.
- becomes **`1.0.0`** once it is known to work across a reasonably wide range of
  operating systems with no big problems.

The About page prefers `version-name` over the integer `version`
(`this.metadata['version-name'] ?? this.metadata.version`), so it shows `0.1.0`.

## Panel roadmap

- See [Versioning](#versioning) for the alpha→beta→1.0.0 release policy and the
  integer EGO `version` vs. human-readable `version-name` split.
- [ ] Support installing versioned plugins from external repositories.
- [ ] Add a repository catalog with provenance, compatibility and permission
  data.
- [x] Add UI for adding, removing, ordering, enabling and configuring plugins
  (`prefs.ts`); searching external repositories is still pending.
- [x] Keep file configuration as the declarative source of truth beneath the
  UI (the preferences UI edits `widgets.json` via `configStore.ts`).
- [ ] Isolate plugin failures and provide rollback to the previous pinned
  revision.

## Requested features (backlog)

Grouped work items requested for the panel and widgets.

### Control menu / panel settings

- [x] Remove the "Auto Position" and "Control Functions" sections from the
  control button's context menu; move them into settings. The menu now has only
  "Settings…"; a preferences "Panel" page holds auto-position + orientation
  (stored in the panel GSettings, applied live); mouse gestures still work.

### cpu-load-monitor settings

- [x] Merge the "Temperature thresholds" and "Colours" groups: one row per
  temperature band (name + temperature + colour). Bands are data-driven in
  `options.bands`; names/count are fixed in the UI but editable in `widgets.json`.
- [x] Templated tooltip with a live preview (shared `tooltipTemplate.ts`).
- [x] Update-interval option.
- [x] Widget-width option.

### ai-agent-usage settings

- [x] Templated tooltip with a live preview.
- [x] Widget-width and update-interval options.
- [x] "Show requests" toggle + template integration (`{requests}` token).
- [x] Token-usage indicator: show/hide toggle and colour selection.
- [x] Window-reset (time-left) indicator: show/hide toggle and colour selection.

### clock settings

- [x] Time format template (standard Linux `date`/strftime string, `options.format`).

### New widgets

- [x] `gnome-menu` widget — opens the app grid; configurable icon / text.
- [x] `favorites` widget — Places menu (Home, XDG dirs, GTK bookmarks);
  configurable icon / text.
- [x] `activities` widget — toggles the Activities overview; configurable
  icon / text.

### Cross-cutting settings groundwork

- [x] A reusable templated-tooltip mechanism (`tooltipTemplate.ts`,
  template + live preview) shared by widgets, plus a shared width/update-interval
  option pattern.
