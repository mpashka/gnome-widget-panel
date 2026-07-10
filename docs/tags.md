# Tags

Registry of `@tag:<slug>` cross-links between code and documentation. A tag
groups files and folders that share a concept but are scattered across the tree,
so one search surfaces every related location. See the "Tags" section in
[`../AGENTS.md`](../AGENTS.md) for the rules.

## How to use

- Documentation file/directory: add a `@tag:<slug>` line near the top of the
  `.md` file (for a directory, in its `index.md`).
- Code file/directory: add a `// @tag:<slug>` comment near the top of the file
  (for a directory, in its main module's leading comment or its `index.md`).
- Register the tag below with a one-line description, then place it on the
  relevant code and doc locations.

Find every location for a tag:

```bash
grep -rn "@tag:<slug>" extension-src docs tests
```

## Registered tags

| Tag | Description |
| --- | --- |
| `mechanism` | Plugin host mechanism: registry, config store, ordering, lifecycle, preferences plumbing and the About/GitHub-issue helper (`extension.ts`, `pluginManager.ts`, `configStore.ts`, `contracts.ts`, `plugins/registry.ts`, `prefs.ts`, `systemInfo.ts`, `docs/architecture.md`, `docs/preferences.md`). |
| `ui` | Panel and preferences UI: floating panel actor, control button, indicator drawer, rendering, the widget-management settings window, the searchable icon picker and the shared templated-tooltip renderer (`extension.ts`, `controlButton.ts`, `indicatorsDrawer.ts`, `prefs.ts`, `tooltipTemplate.ts`, `plugins/iconPicker.ts`, `docs/object-model.md`, `docs/preferences.md`). |
| `widget-keyboard-layout` | The `keyboard-layout` built-in widget. |
| `widget-app-notifications` | The `app-notifications` built-in widget. |
| `widget-cpu-load-monitor` | The `cpu-load-monitor` built-in widget. |
| `widget-ai-agent-usage` | The `ai-agent-usage` built-in widget and its out-of-process collectors. |
| `widget-clock` | The `clock` built-in widget. |
| `widget-ubuntu-system-status` | The `ubuntu-system-status` built-in widget. |
| `widget-gnome-menu` | The `gnome-menu` built-in widget (opens the application grid). |
| `widget-gnome-action` | The `gnome-action` built-in widget ("Gnome Action": overview / app grid / show desktop). Formerly `activities`; that id still resolves as a backward-compat alias. |
| `widget-favorites` | The `favorites` built-in widget (Places menu). |
| `widget-printscreen` | The `printscreen` built-in widget (opens the interactive screenshot UI). |
| `widget-launch` | The `launch` built-in widget (multi-instance command launcher). |
| `dev` | Developer reload-without-logout workflow: symlink install and nested-shell runner (`dev-install.sh`, `dev-run.sh`, `docs/development.md`). |
| `ui-testing` | Headless UI test harness: isolated headless shell + test-driver extension + regression tests and feature-debug stub (`tests/ui/`, `docs/ui-testing.md`). |

Per-widget tags live on that widget's `index.ts` (code) and `index.md` (docs)
under `extension-src/plugins/<id>/`.
