# Changelog

Every released version of GNOME Widget Panel. This file is generated from `docs/releases.json` by the release workflow; each version links to its full, hand-editable release notes on GitHub. See [`docs/release.md`](docs/release.md) for the process.

## GNOME Shell support matrix

Which plugin version to install for your GNOME Shell version:

| GNOME Shell | Min plugin version | Latest plugin version |
| --- | --- | --- |
| 46 | [0.1.0](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0) | [0.1.2](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2) |
| 47 | [0.1.0](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0) | [0.1.2](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2) |
| 48 | [0.1.0](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0) | [0.1.2](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2) |
| 49 | [0.1.0](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0) | [0.1.2](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2) |
| 50 | [0.1.0](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0) | [0.1.2](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2) |

## Releases

### [v0.1.2](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2) — 2026-07-14

Supported GNOME Shell: 46–50.

**✨ Features & improvements**

- EGO review feedback: async file I/O + blank-line readability in generated JS ([#25](https://github.com/mpashka/gnome-widget-panel/issues/25))

[Release notes →](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.2)

### [v0.1.1](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.1) — 2026-07-13

Supported GNOME Shell: 46–50.

**🐛 Fixes**

- [Bug]: Claude AI agent status stays waiting after the user answers ([#21](https://github.com/mpashka/gnome-widget-panel/issues/21))
- AI widgets get no data: Claude hooks read empty stdin (fd 0 is a socket, not /dev/stdin) ([#19](https://github.com/mpashka/gnome-widget-panel/issues/19))
- Settings UI: clicking a widget's settings does nothing for widgets without a colour-button tooltip (cpu-load-monitor) ([#16](https://github.com/mpashka/gnome-widget-panel/issues/16))
- Gigantic font/icons after auto-lock + unlock; widget shown on the lock screen ([#7](https://github.com/mpashka/gnome-widget-panel/issues/7))
- ai-agent-usage: token graph empty for Claude Code (no request markers, no token-load history) ([#6](https://github.com/mpashka/gnome-widget-panel/issues/6))
- Right-click on widget drag area does nothing (context menu never opens, widget flickers/reloads) ([#3](https://github.com/mpashka/gnome-widget-panel/issues/3))

[Release notes →](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.1)

### [v0.1.0](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0) — 2026-07-10

Supported GNOME Shell: 46–50.

[Release notes →](https://github.com/mpashka/gnome-widget-panel/releases/tag/v0.1.0)
