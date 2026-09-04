# Process

`@tag:process`

How work is done in this repository: building and iterating, shipping a release,
filing and fixing bugs, and the code-quality bar every change is held to. Read
the relevant page **before** the matching task.

## Files

- [`development.md`](development.md) — the reload-without-logout developer
  workflow: symlink install, nested GNOME Shell runner, dev GSettings profile and
  the in-session screenshot driver (`@tag:dev`, `@tag:dev-screenshot`).
- [`release.md`](release.md) — the branch model (work on `dev`, renamed to
  `release/A.B.C` at the release, one commit per version on `main`), which part
  of the version a change bumps, the versioning scheme (integer EGO
  `version` vs. human-readable `version-name`, the `alpha` badge), where the
  version is shown, issue-based release notes (milestones → GitHub Release), the
  CHANGELOG / GNOME support matrix and the CI / Release GitHub Actions
  (`@tag:versioning`).
- `releases.json` — machine-readable release ledger (version, code, date,
  supported GNOME versions, notes URL, issues). The Release workflow updates it
  and regenerates [`../../CHANGELOG.md`](../../CHANGELOG.md) from it; see
  [`release.md`](release.md) (`@tag:versioning`).
- [`bug-report-howto.md`](bug-report-howto.md) — the rule for filing bugs
  (mandatory configuration + screenshot/screencast), for humans and agents
  (`@tag:process`).
- [`bug-fixing-workflow.md`](bug-fixing-workflow.md) — the staged workflow
  (reproduce → analyse → fix → regression test → verify → code review), the
  subagent roles that drive it and the debugging methods for Shell-only bugs
  (`@tag:process`).
- [`promotion.md`](promotion.md) — the public presence: the GitHub wiki, the
  extensions.gnome.org listing, how the published screenshots are regenerated
  and how a release is uploaded to the store by hand (`@tag:process`).
- [`ux.md`](ux.md) — the interaction bar every widget is held to: design from
  the use case, weight steps by frequency from where the user already is, act on
  the object under the pointer, preserve exact state through Undo, spend a
  keyboard shortcut only on what is frequent enough to earn one, and know what
  earns a row in the handle menu (`@tag:ux`).
- [`code-quality.md`](code-quality.md) — modularity, uniform naming across the
  codebase and per-widget documentation: the rules that keep the cost of change
  from growing (`@tag:process`).

## Related

- Working files of an individual task (request, plan, debug scripts) live under
  [`../requests/index.md`](../requests/index.md), not here.
- Test harnesses the workflow calls for: [`../testing/index.md`](../testing/index.md).

Back to the [documentation index](../index.md).
