# Tags

Registry of `@tag:<slug>` cross-links between code and documentation. A tag
groups files and folders that share a concept but are scattered across the tree,
so one search surfaces every related location. The rules live in
[`../.claude/rules/llm-wiki-tags/tags.md`](../.claude/rules/llm-wiki-tags/tags.md),
summarised in the "Tags" section of [`../AGENTS.md`](../AGENTS.md).

## How to use

- Documentation file/directory: add a `@tag:<slug>` line near the top of the
  `.md` file (for a directory, in its `index.md`).
- Code file/directory: add a `// @tag:<slug>` comment near the top of the file
  (for a directory, in its main module's leading comment or its `index.md`).
- Register the tag below with a one-line description, then place it on the
  relevant code and doc locations.

Find every location for a tag:

```bash
grep -rn "@tag:<slug>" extension-src docs tests   # one tag
grep -rhoE "@tag:[a-z0-9-]+" . | sort -u          # every tag in use
```

## Tags and the documentation tree

Tags are hierarchical by prefix: `widget-<id>` groups everything belonging to one
built-in widget, `prefs-<area>` groups one preferences building block. A concept
usually appears once per documentation category — its user-visible side in
[`specification/`](specification/index.md), its construction in
[`implementation/`](implementation/index.md), its cases in
[`testing/`](testing/index.md) — so a page is named after the tag it owns
(`docs/<category>/<tag>.md`, or a `docs/<category>/<tag>/` directory when it
needs several pages). One `grep` for the tag then returns the whole concept:
code, user guide, internals and tests.

## Registered tags

| Tag | Description |
| --- | --- |
| `process` | Contributor/agent process rules: how to file a bug, the staged bug-fixing workflow (with subagents) and the code-quality rules that keep change cost flat (`docs/process/bug-report-howto.md`, `docs/process/bug-fixing-workflow.md`, `docs/process/code-quality.md`, `.github/ISSUE_TEMPLATE/`, `AGENTS.md` Process section). |
| `mechanism` | Plugin host mechanism: registry, config store, ordering, lifecycle, preferences plumbing and the About/GitHub-issue helper (`extension.ts`, `pluginManager.ts`, `configStore.ts`, `contracts.ts`, `plugins/registry.ts`, `prefs.ts`, `systemInfo.ts`, `docs/implementation/architecture.md`, `docs/implementation/preferences.md`). |
| `ui` | Panel and preferences UI: floating panel actor, control button, indicator drawer, rendering, the widget-management settings window, the searchable icon picker and the shared templated-tooltip renderer (`extension.ts`, `controlButton.ts`, `indicatorsDrawer.ts`, `prefs.ts`, `tooltipTemplate.ts`, `plugins/iconPicker.ts`, `docs/implementation/object-model.md`, `docs/implementation/preferences.md`). |
| `versioning` | Version fields, the `alpha` release-channel badge, where the version is shown, issue-based release notes (milestones → GitHub Release), the CHANGELOG / GNOME support matrix, and the CI / Release automation (`extension-src/version.ts`, `systemInfo.ts` version + release-notes helpers, `controlButton.ts` menu, `prefs.ts` About group, `metadata.json`, `.github/workflows/`, `.github/scripts/` incl. `release-notes.mjs`, `docs/process/releases.json`, `CHANGELOG.md`, `tests/version.test.mjs`, `docs/process/release.md`). |
| `widget-keyboard-layout` | The `keyboard-layout` built-in widget. |
| `widget-app-notifications` | The `app-notifications` built-in widget. |
| `widget-cpu-load-monitor` | The `cpu-load-monitor` built-in widget. |
| `widget-ai-agent-usage` | The `ai-agent-usage` built-in widget and its out-of-process collectors. |
| `widget-ai-agent-status` | The `ai-agent-status` built-in widget (per-session Claude status dots fed by lifecycle event hooks). |
| `widget-clock` | The `clock` built-in widget. |
| `widget-ubuntu-system-status` | The `ubuntu-system-status` built-in widget. |
| `widget-gnome-menu` | The `gnome-menu` built-in widget (opens the application grid). |
| `widget-gnome-action` | The `gnome-action` built-in widget ("Gnome Action": overview / app grid / show desktop). Formerly `activities`; that id still resolves as a backward-compat alias. |
| `widget-favorites` | The `favorites` built-in widget (Places menu). |
| `widget-printscreen` | The `printscreen` built-in widget (opens the interactive screenshot UI). |
| `widget-launch` | The `launch` built-in widget (multi-instance command launcher). |
| `widget-caffeine` | The `caffeine` built-in widget (manual screensaver/suspend inhibitor toggle). |
| `widget-break-timer` | The `break-timer` built-in widget (Workrave-style micro/rest/daily activity-based rest reminders). |
| `main-panel` | GNOME top-bar (main panel) behaviour control: hide / auto-hide / visible, the built-in Hide Top Bar replacement (`extension-src/mainPanel.ts`, `extension.ts` gating, `prefs.ts` group + conflict detection, the `main-panel` schema key, `docs/implementation/object-model.md`, `docs/implementation/preferences.md`). |
| `dev` | Developer reload-without-logout workflow: symlink install and nested-shell runner (`dev-install.sh`, `dev-run.sh`, `docs/process/development.md`). |
| `ui-testing` | Headless UI test harness: isolated headless shell + test-driver extension + regression tests and feature-debug stub (`tests/ui/`, `docs/testing/ui-testing.md`). |
| `dev-screenshot` | Dev-only in-session screenshot driver for debugging UI bugs: an internal-`Shell.Screenshot` D-Bus extension + CLI, never shipped in a release (`tools/dev-screenshot/`, `docs/process/development.md`). |
| `prefs-template` | Templated preferences rows built from a declarative widget-options description (`extension-src/prefsTemplate.ts`). |
| `prefs-color` | Colour handling in the preferences UI: colour rows and the GObject initializer sanitiser they depend on (`extension-src/prefsColor.ts`, `extension-src/props.ts`, `tests/props.test.mjs`). |
| `reference` | Background reference material that informs decisions but describes nothing shipped (`docs/roadmap/widget-ideas.md`). |

Per-widget tags live on that widget's `index.ts` (code) and `index.md` (docs)
under `extension-src/plugins/<id>/`.
