# Documentation index

All GNOME Widget Panel documentation lives under `docs/`, split by *what kind of
question the page answers*. Start here, follow the category index, then follow
the links down to the code under [`../extension-src/index.md`](../extension-src/index.md).

## Categories

- [`specification/`](specification/index.md) — how the extension looks and
  behaves **for its users**: the widgets catalog, per-widget behaviour, settings
  the AI-graph walkthrough and the [use-case
  tree](specification/use-cases/index.md) (one page per user goal, with the
  gestures it costs). Written for people using the extension.
- [`implementation/`](implementation/index.md) — how it is built **inside**:
  host/plugin architecture, runtime object model, the preferences mechanism and
  the upstream origin.
- [`testing/`](testing/index.md) — test cases and the harnesses that run them
  (gi-free unit tests, headless UI regression suite).
- [`process/`](process/index.md) — how work is done: developer workflow, release
  process, bug reporting/fixing and code-quality rules.
- [`roadmap/`](roadmap/index.md) — what is planned but not built: the backlog,
  candidate widgets and design concepts.
- [`requests/`](requests/index.md) — per-task working files (request, plan, debug
  scripts, reports). Temporary, agent-facing, kept out of git.

## Files

- [`tags.md`](tags.md) — registry of `@tag:<slug>` cross-links between code and
  documentation. Every category and every widget is reachable by tag.

Back to the [repository index](../index.md); the working rules for agents,
including the documentation layout rules, are in
[`../AGENTS.md`](../AGENTS.md).
