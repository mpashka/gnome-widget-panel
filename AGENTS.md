# AGENTS.md

Working rules for AI agents in this repository; `CLAUDE.md` points here.
Reusable GNOME Shell floating panel and widget host. Read `README.md` and the
documentation tree under [`docs/`](docs/index.md) before making changes.

## Language

Code, comments, commit messages and agent-facing documentation (this file,
`docs/`, every `index.md`) are English, whatever language the request is in.

## Source of truth: `extension-src/`, never `extension/`

TypeScript in `extension-src/` is the source; `extension/` is a gitignored build
artifact (`npm run build` copies every non-`.ts` asset verbatim and compiles the
TypeScript into it). Never edit `extension/*.js` — anything placed only there is
destroyed by the next build, so docs, config and schemas are authored under
`extension-src/` too. Never execute unreviewed generated code.

## Commands

[`./gwp`](gwp) is the **only script in the repository root**; with no arguments
it shows the state and every command. New build/install/dev actions become `gwp`
subcommands, never a second root script.

```bash
./gwp build         # assets + tsc extension-src -> extension (= npm run build)
./gwp install       # build + schemas + copy to the extensions dir (needs relogin)
./gwp dev-install   # one-time: symlink the build tree into the isolated dev dir
./gwp dev           # rebuild + restartable nested GNOME Shell window (no logout)
./gwp dev-settings  # snapshot/monitor/poke the dev shell's GSettings, or its prefs
npm run typecheck   # tsc --noEmit
npm test            # gi-free unit tests
npm run test:ui     # headless GNOME Shell UI regression suite
npm run test:prefs  # open every widget's settings page and press every control
npm run check:ego   # pack, then Shexli — the checker EGO runs on every upload
```

Which suite a change needs, and the code rules (contract typing, formatting of
the emitted JS, no sync I/O on the Shell thread, architecture invariants):
[`docs/CODE_REQUIREMENTS.md`](docs/CODE_REQUIREMENTS.md). Fast iteration without
logout: [`docs/process/development.md`](docs/process/development.md). UUID
`gnome-widget-panel@mpashka.github.com`; it installs alongside the original
Floating Mini Panel.

**Finish a task by installing it: `./gwp install`.** The user's own panel is
where the work is used, and the next manual check starts from what is installed.
Once code, docs and tests are in place and the affected suite is green, install,
and say the build needs a **logout/login** to load (a plain install never
reloads on Wayland: Shell caches the module). The dev-only
[`version-status`](extension-src/plugins/version-status/index.md) widget shows
while a relogin is pending; the handle's context-menu header shows the running
version and commit. Do not install a tree you know to be broken — fix it or say
why it stays uninstalled.

Perform code work — reading and editing files, navigation, builds, commands,
tests — through the IntelliJ **IDEA MCP** tools (`mcp__idea__*`), not ad-hoc
shell equivalents. Do **not** start `codex-mcp-client` in the IDEA terminal: it
keeps stealing focus. Inspect existing MCP state/logs or ask first.

## Architecture map

A GNOME Shell 50 floating panel host (derived from Floating Mini Panel v8) that
loads an ordered list of built-in **plugins** from the `widgets` GSettings key.
`extension.ts` owns positioning, panel lifecycle and error isolation;
`pluginManager.ts` is the registry and loader; `aiCollector.ts` owns AI agent
collection, and the AI widgets are views of it. Design:
[`docs/implementation/`](docs/implementation/index.md) —
[`architecture.md`](docs/implementation/architecture.md),
[`ai-collector.md`](docs/implementation/ai-collector.md),
[`object-model.md`](docs/implementation/object-model.md); per-widget notes in
`extension-src/plugins/<id>/index.md`.

## Documentation and tags — what differs here

The llm-wiki-tags convention applies; this repository's specifics:

- Categories: `specification/` (for users — README links there),
  `implementation/`, `testing/`, `process/`, `roadmap/` — see
  [`docs/index.md`](docs/index.md). Local detail stays next to the code.
- A doc carries its tag as a **`@tag:<slug>` line under the heading**, not front
  matter. Registry: [`docs/tags.md`](docs/tags.md). Code tags:
  `.claude/rules/llm-wiki-tags/code-tags-*.md`.
- The root keeps only `AGENTS.md`, `CLAUDE.md`, `README.md`, `LICENSE`,
  `index.md`, `CHANGELOG.md`, `gwp` and what tooling requires there.
- When a widget's behaviour, icon or options change, update the
  [widgets catalog](docs/specification/widgets.md) and its own page; when code
  moves, the nearest `index.md` and
  [`object-model.md`](docs/implementation/object-model.md). When a page moves,
  grep `.github/scripts/` and `.github/workflows/` too — they read doc paths.
- Orchestration state of `/orchestrator-task` goes to `docs/requests/<task>/`
  like any task file; the orchestrator passes these rules and explicit file
  ownership to every delegated agent.

## Git: `dev` and `main`

This repository departs from the general "commit to the main branch" rule on
purpose.

- **`main` holds released versions only — one commit per version. Work happens
  on `dev`.** Never commit or push to `main` outside a release. `dev` carries as
  many commits as the work takes, one per finished task. At release `dev` is
  renamed `release/A.B.C`, squashed onto `main` as one tagged commit, and a
  fresh `dev` is cut; a new widget is a minor bump, changes inside widgets a
  patch. Procedure: [`docs/process/release.md`](docs/process/release.md).
- **Commit a task when it is finished** — code, docs and tests together, suite
  green. Two sessions' unfinished hunks in one tree cannot be split cheaply.

## Process

Read the page before the matching task:

- **Filing an issue** — search existing ones, open and closed, first; comment or
  reopen instead of duplicating:
  [`docs/process/bug-report-howto.md`](docs/process/bug-report-howto.md).
- **Fixing a bug** — [`docs/process/bug-fixing-workflow.md`](docs/process/bug-fixing-workflow.md):
  dev before prod (`npm run test:ui`, `./gwp dev`; never send the user through a
  relogin for what a dev run shows), script every step you can, run repro loops
  in a subagent. Shell-only bugs with the user: its "Debugging methods" — a
  fresh `docs/requests/<task>/manual-testing.md` with numbered steps, one
  state-driven script, temporary `GWP-DBG` logs stripped before the commit, and
  the agent reads the logs and cleans up.
- **UX** — the general rules are the ux-principles convention (occasion rule
  `ai @/rules-on-demand/ux-design.md`, canon `ai @/ux/rules/`);
  [`docs/process/ux.md`](docs/process/ux.md) holds what is true of this panel
  and wins over them.
- **Code quality** — [`docs/process/code-quality.md`](docs/process/code-quality.md).
- **Backlog** — [`docs/roadmap/backlog.md`](docs/roadmap/backlog.md).
