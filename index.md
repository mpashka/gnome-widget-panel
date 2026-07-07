# GNOME Widget Panel index

Configurable floating GNOME Shell panel implemented as TypeScript source and
generated GJS runtime code.

## Directories

- [`extension-src/`](extension-src/) — source of truth for TypeScript modules,
  static GNOME extension assets and plugin-local documentation.
- [`extension/`](extension/) — generated install tree produced by
  `npm run build`; do not edit generated JavaScript directly.
- [`extension-src/plugins/`](extension-src/plugins/index.md) — built-in widget
  plugins, one directory per widget.
- [`docs/`](docs/) — architecture, object model, upstream notes and AI-assisted
  management documentation.
- [`schema/`](schema/) — JSON schemas for future external widget manifests.

## Main files

- [`AGENTS.md`](AGENTS.md) — working rules and LLM wiki documentation rules.
- [`TODO.md`](TODO.md) — contract-typing backlog and panel roadmap.
- [`README.md`](README.md) — user-facing overview, install and development
  commands.
- [`build.sh`](build.sh) — regenerates `extension/` from `extension-src/`.
- [`install.sh`](install.sh) — builds and installs the extension into the user
  GNOME Shell extension directory.
- [`docs/object-model.md`](docs/object-model.md) — runtime object map.
- [`docs/architecture.md`](docs/architecture.md) — architecture and roadmap.

## Development path

Edit TypeScript in `extension-src/`, run `npm run build`, then run
`./install.sh`. GNOME Shell JavaScript changes usually require logout/login on
Wayland.
