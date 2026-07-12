# Dev screenshot tool

`@tag:dev-screenshot`

Back to [development](../../docs/development.md) ·
[bug-fixing workflow](../../docs/bug-fixing-workflow.md).

A **dev-only** way for an agent to screenshot the real GNOME session while
debugging a UI bug. It is **not part of the product**: it lives here under
`tools/` (outside the packed `extension/` tree), so it is never shipped in a
release. An agent installs it for a debug session and removes it afterwards.

## Why it exists

On GNOME 44+ every *external* screenshot path is unusable for an unattended
agent:

- `org.gnome.Shell.Screenshot` over D-Bus → `AccessDenied` (sender check).
- `gnome-screenshot` → fails under Shell 50 on Wayland (X11 fallback).
- `org.gnome.Shell.Screencast` from the CLI → produces a broken/empty file.
- `org.freedesktop.portal.Screenshot` → pops an interactive permission dialog.
- `grim`/`wf-recorder` → wlroots tools; don't work under GNOME's Wayland.

But code running **inside** gnome-shell can call the internal `Shell.Screenshot`
GObject directly, with no sender check. So this is a tiny extension that exports
`org.gwp.DevShot` on the session bus and captures on request.

## Files

- `gwp-dev-shot@gwp.dev/` — the extension (`metadata.json`, `extension.js`).
  Methods: `Screenshot(include_cursor, path)`, `ScreenshotArea(x,y,w,h,path)`,
  `PanelBounds()` (JSON `{x,y,width,height}` of the widget panel).
- `gwp-shot` — the CLI that installs/enables the extension and calls those
  methods.

## Use

```bash
tools/dev-screenshot/gwp-shot install    # copy + enable
tools/dev-screenshot/gwp-shot status     # is it installed / on the bus?
tools/dev-screenshot/gwp-shot panel      # PNG of just the widget panel
tools/dev-screenshot/gwp-shot full       # PNG of the whole screen
tools/dev-screenshot/gwp-shot area X Y W H [out.png]
tools/dev-screenshot/gwp-shot uninstall  # disable + remove when done
```

PNGs default to `~/Pictures/gwp-shots/` (override with `GWP_SHOT_DIR`). The agent
reads them back directly.

**One-time relogin.** A *freshly installed* extension isn't visible to
gnome-shell until it rescans the extensions dir, which only happens on login. So
`install` copies the files and tries to enable; if that reports "hasn't scanned
it", log out/in once and run `gwp-shot enable`. Piggy-back this on any relogin
you already need (e.g. to load a new widget-panel build). After that the tool
stays enabled and captures with no further relogins.

**Dev-first.** Prefer the headless UI harness (`tests/ui/lib.sh`'s
`ui_screenshot`, which uses the same `Shell.Screenshot`) for anything
reproducible without the real session; reach for this tool only when you must see
the user's actual prod session. See the "dev before prod" and "minimise human
interaction" rules in [`bug-fixing-workflow.md`](../../docs/bug-fixing-workflow.md).
