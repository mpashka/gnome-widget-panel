# Requests

Working files of individual tasks — one directory per task,
`docs/requests/<task-name>/`. This is where a task's **request**, **plan**,
**debug scripts**, captured logs and **reports** live while the work is running
and after it lands.

These files are **temporary, agent-facing work state**, not project
documentation: they are kept out of git (`.git/info/exclude`) unless the user
explicitly asks to commit one. Durable conclusions belong in
[`../specification/`](../specification/index.md),
[`../implementation/`](../implementation/index.md),
[`../testing/`](../testing/index.md) or [`../process/`](../process/index.md) —
this directory is not a substitute for updating them.

## Conventions

- `request.md` — the task as it was given, verbatim where possible.
- `plan.md` — the staged plan with a status marker per item
  (`[ ]` todo · `[~]` in progress · `[X]` done · `[!]` blocked), ticked as work
  moves. The file, not memory, is the source of truth for progress.
- `manual-testing.md` — numbered manual steps for the user, recreated from
  scratch per session.
- `debug.sh` / `repro.sh` — task-scoped scripts; state-driven where they walk the
  user through steps.
- `report.md` / `review.md` — findings and outcomes.
- A bug task is named `issue-<N>`; other tasks get a short kebab-case slug.

## Directories

- `ego-code-review/` — full-project AI code review for the extensions.gnome.org
  submission (plan + severity-ranked findings).
- `issue-3/` — right-click on the drag handle not opening the context menu:
  manual test plan and the state-driven debug script.
- `issue-5/` — context and local reproduction script for issue #5.
- `issue-7/` — debug script for the disable/enable (screen lock) crash.
- `promotion/` — extensions.gnome.org listing, icon assets, forum research and
  the GitHub wiki pages prepared for publication.
- `release-0.1.2/` — the release plan for v0.1.2 (per-bug workflow and status).
- `ui-bugs-and-single-cli/` — the bold clock, the dead Hide Top Bar Remove
  button and the shaking applications menu, plus folding the five root shell
  scripts into the single `gwp` CLI.
- `widget-settings-ux/` — the original request behind the GNOME-like
  menu/places/activities widgets and the live-apply settings work.

Back to the [documentation index](../index.md).
