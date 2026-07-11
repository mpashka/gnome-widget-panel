# Documentation index

Architecture, object model and process documentation for GNOME Widget Panel.
Start here, then follow the links down to the code under
[`../extension-src/`](../extension-src/index.md).

## Files

- [`architecture.md`](architecture.md) — host/plugin architecture, `ai-agent-usage`
  design and roadmap.
- [`preferences.md`](preferences.md) — widget-management preferences UI and the
  per-widget settings mechanism.
- [`development.md`](development.md) — reload-without-logout developer workflow
  (symlink install + nested GNOME Shell).
- [`release.md`](release.md) — versioning scheme (integer EGO `version` vs.
  human-readable `version-name`, the `alpha` release-channel badge), where the
  version is shown, issue-based release notes (milestones → GitHub Release), the
  CHANGELOG / GNOME support matrix, and the CI / Release GitHub Actions.
- `releases.json` — machine-readable release ledger (version, code, date,
  supported GNOME versions, notes URL, issues) that the Release workflow updates
  and regenerates `../CHANGELOG.md` from; see [`release.md`](release.md).
- [`ui-testing.md`](ui-testing.md) — headless UI test harness: approaches
  considered, architecture, regression suite (`npm run test:ui`) and the
  feature-debug stub workflow.
- [`bug-report-howto.md`](bug-report-howto.md) — the rule for filing bugs
  (mandatory configuration + screenshot/screencast), for humans and agents.
- [`bug-fixing-workflow.md`](bug-fixing-workflow.md) — staged bug-fixing workflow
  (reproduce → analyse → fix → regression test → verify → code review) using
  subagents.
- [`code-quality.md`](code-quality.md) — modularity, uniform naming, per-widget
  documentation and the rules that keep change cost from growing over time.

End-user documentation lives separately under
[`../user-guide/`](../user-guide/index.md) (widgets catalog, AI-graph
walkthrough + interactive preview) — it is written for people using the
extension, not for agents. Keep the `ai-agent-usage` spec/preview there in sync
with the plugin when its behaviour changes.
- [`object-model.md`](object-model.md) — runtime object map.
- [`ai-management.md`](ai-management.md) — AI-assisted panel management concept.
- [`upstream.md`](upstream.md) — Floating Mini Panel origin and license notes.
- [`tags.md`](tags.md) — registry of `@tag:<slug>` cross-links between code and docs.
- [`xfce-widget-ideas.md`](xfce-widget-ideas.md) — reference: XFCE-inspired
  candidate widgets and a prioritized shortlist for what to add next.

## Directories

- [`upstream/`](upstream/) — upstream reference material.

Back to the [repository index](../index.md) and working rules in
[`../AGENTS.md`](../AGENTS.md).
