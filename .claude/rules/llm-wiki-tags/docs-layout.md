---
description: Where every kind of document belongs in this repository.
---

# llm-wiki-tags — documentation layout

All documentation lives under `docs/`. There is no second documentation root.

```
docs/
├── index.md            # index of the documentation
├── tags.md             # tag registry
├── specification/      # how the extension looks and behaves for its users
├── implementation/     # how it is built inside
├── testing/            # test cases and the harnesses that run them
├── process/            # how work is done: dev workflow, release, bugs, quality
├── roadmap/            # planned, not built
└── requests/<task>/    # working files of one task
```

- `specification/` — widgets catalog, per-widget behaviour, settings, user-facing
  walkthroughs. `implementation/` — architecture, runtime object model,
  preferences mechanism, upstream origin. `testing/` — test cases; the per-case
  catalogs stay next to the tests in `tests/index.md` and `tests/ui/index.md`.
  A page belongs to exactly one category.
- Organise these trees **by tag**: a tag becomes a page
  (`docs/implementation/<tag>.md`) or, once it grows, a directory with its own
  `index.md`. Prefer hierarchy over long flat names.
- **Task working files go to `docs/requests/<task-name>/`** — `request.md` (the
  task as given), `plan.md` (staged plan with a status marker per item),
  `manual-testing.md`, `debug.sh`/`repro.sh`, `report.md`. A bug task is named
  `issue-<N>`; anything else gets a short kebab-case slug. Never leave such files
  at the repository root or beside the code. They are git-excluded via
  `.git/info/exclude`; do not commit one unless the user asks.
- **What outlives the task moves out of `requests/`** in the same change: into
  `specification/`, `implementation/`, `testing/` or `process/`. The request
  folder is history, not a place to look things up.
- **Local detail stays next to the code**: `extension-src/plugins/<id>/index.md`,
  `tests/ui/index.md`. `docs/` links to it instead of restating it.
- **The repository root keeps only** `AGENTS.md`, `CLAUDE.md`, `README.md`,
  `LICENSE`, `index.md`, `CHANGELOG.md`, the build/install entry-point scripts,
  and files tooling requires there (`package.json`, `package-lock.json`,
  `tsconfig.json`, `ambient.d.ts`, `.gitignore`). Anything else you are tempted
  to drop in the root belongs in `docs/requests/<task-name>/`.
- When a page moves, fix every link **and every link label** pointing at it in
  the same change. `grep -rn "<old-path>"`, including `.github/scripts/` and
  `.github/workflows/`, which read some doc paths at runtime.
