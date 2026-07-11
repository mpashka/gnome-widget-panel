# Code quality rules

`@tag:process`

Back to the [documentation index](index.md) and [working rules](../AGENTS.md).

The one goal behind every rule here: **adding a feature or fixing a bug must not
get harder as the project grows.** A codebase decays when each change makes the
next one costlier — inconsistent names force re-reading, duplicated logic forces
multi-site edits, undocumented widgets force re-discovery. These rules keep the
marginal cost of change flat.

## 1. Modularity

- **One responsibility per module.** A plugin's `index.ts` wires a widget;
  drawing, parsing and I/O live in named siblings (see how `ai-agent-usage`
  splits `aiAgentUsageGraph.ts`, `claudeHook.ts`, `helpers/*`). If a file grows
  two unrelated jobs, split it.
- **Extract pure logic from Shell code.** Anything that does not need GJS/Clutter
  goes into a gi-free module so it is unit-testable with `npm test` (e.g.
  `tooltipTemplate.ts`, `widgetConfig.ts`). Prefer this over loading Shell-only
  code in tests (AGENTS.md).
- **Respect the boundaries.** Config flows through `configStore.ts`; plugins are
  reached through the `pluginManager.ts` registry; contracts live in
  `contracts.ts`. Do not add a second settings model or a second registry, and
  do not reach around these seams.
- **Lifecycle discipline.** Every timer, signal, `Soup.Server` and child process
  acquired by a widget is released in its `destroy()`. A leak here makes every
  future widget's lifecycle harder to reason about.

## 2. Uniformity (the highest-leverage rule)

Consistency is what lets a reader (human or agent) predict the code instead of
re-reading it. Match the surrounding code; do not introduce a competing style.

- **Names are uniform across the whole codebase.** The same concept has the same
  name everywhere — variable, method, option key, config field, doc term. If it
  is `provider` in one file it is not `agent` / `source` / `kind` in another; if
  a widget option is `updateInterval` the accessor, the docs and the settings UI
  all say `updateInterval`. When you rename a concept, rename **every**
  occurrence (code, `options` keys, docs, tests) in the same change — a
  half-rename is worse than no rename.
- **Follow the established vocabulary:** `provider`, `sample`, `widget`/`plugin`,
  `options`, `config`, `create(parent, options)`, `destroy()`. Reuse these; do
  not coin synonyms.
- **Uniform shapes.** New plugins follow the existing plugin layout
  (`index.ts` + `prefs.ts` + `index.md`, helpers beside them). New options are
  validated in the same place and style as existing ones.
- **Formatting and lint are not optional.** Run the project formatter/typecheck;
  do not hand-format one file differently.

## 3. Every subwidget is well documented

A widget nobody can understand from its docs is a widget nobody can safely
change. Each plugin under `extension-src/plugins/<id>/` **must** have an
`index.md` that covers:

- **Purpose** — what the widget shows and why, in one or two sentences.
- **Source files** — one line each (`index.ts`, `prefs.ts`, helpers).
- **Options** — every `options` key: name, type, default, effect. Keep this in
  sync with `prefs.ts` and the parser; an undocumented option is a bug.
- **Data model / rendering** — how inputs become what the user sees (the
  `ai-agent-usage` doc is the reference depth).
- **Behaviour specifics** — vertical/rotation handling, tooltip, live-apply,
  external processes, security (secrets, localhost servers).
- **Related docs** — links back to the plugins index and architecture.

When you change a widget's behaviour or options, update its `index.md` in the
same change (AGENTS.md documentation rule). Cross-file concepts also get a
`@tag:<slug>` registered in [`tags.md`](tags.md).

## 4. Typing at the boundaries

Runtime files may stay `// @ts-nocheck`, but every contract you touch gets typed
in the same change: widget config, plugin registry/lifecycle, provider payloads,
per-provider history, helper/hook messages (AGENTS.md "TypeScript contract typing
rules"). Validate untrusted JSON at runtime before treating it as typed. Typed
seams are what let the next change refactor safely.

## 5. Minimal, reversible changes

- Prefer reusing an existing helper over adding a parallel one; prefer the
  smallest diff that solves the root cause.
- No dead code, no speculative options, no silent behaviour changes bundled with
  an unrelated fix.
- Author generated output in `extension-src/`; never hand-edit `extension/*.js`.

## The ratchet, restated

Each change should leave the code **at least as easy to change as it found it**:
one name per concept, one home per detail, a test that pins new behaviour
([bug-fixing-workflow.md](bug-fixing-workflow.md)), and a doc that explains it.
Reviews (`/code-review`) enforce this — a diff that degrades uniformity or leaves
a widget undocumented is not ready to merge.
