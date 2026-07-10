# GNOME Widget Panel index

Configurable floating GNOME Shell panel implemented as TypeScript source and
generated GJS runtime code.

## Directories

- [`extension-src/`](extension-src/) — source of truth for TypeScript modules,
  static GNOME extension assets and plugin-local documentation.
- `extension/` — generated install tree produced by `npm run build`; a build
  artifact (gitignored, not committed), regenerated wholesale on every build. Do
  not edit it directly.
- [`extension-src/plugins/`](extension-src/plugins/index.md) — built-in widget
  plugins, one directory per widget.
- [`docs/`](docs/index.md) — architecture, object model, upstream notes,
  AI-assisted management and the tag registry.
- [`schema/`](schema/) — JSON schemas for future external widget manifests.
- [`tests/`](tests/index.md) — Node unit tests for the gi-free pure-logic
  modules (`npm test`).

## Main files

- [`AGENTS.md`](AGENTS.md) — working rules and LLM wiki documentation rules.
- [`TODO.md`](TODO.md) — contract-typing backlog, panel roadmap and the
  requested-features backlog (new widgets and per-widget settings work).
- [`README.md`](README.md) — user-facing overview, install and development
  commands.
- `.github/ISSUE_TEMPLATE/` — GitHub issue *forms* (`bug_report.yml`,
  `feature_request.yml`, `widget_request.yml`, `config.yml`) opened prefilled
  from the extension's About page and Add-a-widget subpage via
  `extension-src/systemInfo.ts`.
- [`build.sh`](build.sh) — regenerates `extension/` from `extension-src/`.
- [`install.sh`](install.sh) — builds and installs the extension into the user
  GNOME Shell extension directory.
- [`dev-install.sh`](dev-install.sh) — symlink developer install for reload
  without logout.
- [`dev-run.sh`](dev-run.sh) — rebuild and run a restartable nested GNOME Shell
  window (`gnome-shell --devkit`), tailing the extension log.
- [`dev-gsettings-diagnose.sh`](dev-gsettings-diagnose.sh) — inspect and poke
  the dev-shell GSettings/dconf profile used by `dev-run.sh`.
- [`docs/object-model.md`](docs/object-model.md) — runtime object map.
- [`docs/architecture.md`](docs/architecture.md) — architecture and roadmap.
- [`docs/development.md`](docs/development.md) — reload-without-logout workflow.

## Development path

Edit TypeScript in `extension-src/`, run `npm run build`, then run
`./install.sh` (needs logout/login on Wayland). For fast iteration without
logout, use `./dev-install.sh` once and `./dev-run.sh` to reload in a nested
GNOME Shell; see [`docs/development.md`](docs/development.md).
