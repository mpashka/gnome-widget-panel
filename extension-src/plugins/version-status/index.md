# version-status widget (developer)

`@tag:widget-version-status` `@tag:dev`

Back to [plugins index](../index.md).

## Purpose

Answers one question that has no other answer on screen: **is the panel I am
looking at the panel I just installed?**

`./gwp install` replaces the files immediately, but GNOME Shell keeps the ES
modules it loaded at login for the life of the `gnome-shell` process — that is
why installing needs a logout/login on Wayland. Until that relogin happens the
running panel is the *previous* build, and it looks exactly like the new one.
Every fix verified against it is verified against the wrong code; that is the
mistake this widget exists to prevent.

It is a **warning, not a display.** Its whole message is "the build on disk is
newer than the one this Shell is running — testing what you see is pointless
until you log out and back in", so once the two agree it has nothing to say and
**takes no space in the panel** ([a warning is shown only while it
stands](../../../.claude/rules/ux/core.md)). Between installs the panel looks
exactly as it would without the widget; it comes back the moment a newer build
lands. The panel is told through `selfHidden` on the actor plus the host's
`updateWidgetVisibility()` (see [`../../contracts.ts`](../../contracts.ts)):
collapsing hides everything regardless, so the panel — not the widget — owns
`visible`.

It is a **developer widget**: `devOnly: true` in
[`../registry.ts`](../registry.ts) puts it in its own "Developer widgets" group
in *Add a widget*, and it is not part of
[`defaultWidgetConfig()`](../../widgetConfig.ts) — nobody gets it unless they
add it.

## The two instants it compares

| | What it is | Where it comes from |
|---|---|---|
| **Running** | when the code in memory started running | `LOADED_AT` — `Date.now()` at *module load*. A relogin is the only thing that moves it: ES modules are cached per `gnome-shell` process, so a disable/enable cycle or the lock screen does not. |
| **Installed** | when the build on disk was made | `builtAtMs` in `build-stamp.json`, written by `./gwp build` at the root of the built tree and copied into the install. |

The stamp also carries the identity of that build — `commit` and `dirty`, plus
the formatted `label` — which is what the handle menu's header shows; the
contract and its parser live in [`../../buildStamp.ts`](../../buildStamp.ts).

`builtAtMs > LOADED_AT` ⇒ the build on disk arrived after this shell started ⇒
a relogin is pending. The first read that is *not* newer also identifies the
build in memory: its `label` is remembered (module-level, so it survives the
panel rebuild a settings change causes) and shown as "Running: …" once a newer
build has replaced the file.

The stamp file is read by [`../../systemInfo.ts`](../../systemInfo.ts), which
sits at the root of the tree and finds it from its own `import.meta.url`, so a
real install and the symlinked dev tree both work with no path plumbing. It is
excluded from the extensions.gnome.org zip
([`.github/scripts/pack.sh`](../../../.github/scripts/pack.sh)): it identifies
one local build and means nothing to a store user.

## States

| State | On screen | Icon | Panel text | Meaning |
|---|---|---|---|---|
| `current` | no | `object-select-symbolic` | — | The running code is the build on disk. Nothing to report, so nothing is shown. |
| `stale` | yes | `software-update-urgent-symbolic`, amber | `relogin` | A newer build is installed; log out and back in to run it. |
| `unknown` | yes | `dialog-question-symbolic` | — | No `build-stamp.json` beside the extension — a store install, or a tree not built by `./gwp build`. Shown, because a widget that cannot answer its own question is itself worth noticing. |

Only the warning state is coloured (`.version-status-stale` in
[`../../stylesheet.css`](../../stylesheet.css)): it must be noticeable from
across the screen, while the settled state must not compete with the widgets
carrying real information.

## Interactions

- **Hover** shows the installed and running labels and, when stale, what to do
  about it. Hovering also re-reads the stamp: someone who just installed wants
  the answer of this second, and it costs one small async file read.
- **Click** re-checks immediately.
- Unattended, it re-checks every 30 s **whether or not it is on screen** — the
  poll is how a hidden widget notices the install that brings it back.

## Options

None. The icon and the label are the state; making them configurable would
allow a build indicator that does not indicate the build.

## Source files

- `index.ts` — the panel button: the stamp read, the 30 s re-check, the
  tooltip, the per-state style class and the self-hiding. `LOADED_AT` lives
  here, at module scope, because module scope is exactly the lifetime the widget
  reports on.
- `versionState.ts` — gi-free verdict: `evaluateVersionState` returns the kind,
  whether the button is on screen, its icon, panel text and tooltip. Unit tested
  in [`../../../tests/versionState.test.mjs`](../../../tests/versionState.test.mjs).
- [`../../buildStamp.ts`](../../buildStamp.ts) — the stamp itself: its fields,
  its parser and the short `commit[-dirty]` identity. Shared with the handle
  menu, unit tested in
  [`../../../tests/buildStamp.test.mjs`](../../../tests/buildStamp.test.mjs).

Covered in a running shell by
[`../../../tests/ui/t-25-version-status.sh`](../../../tests/ui/t-25-version-status.sh):
it finds its stamp, warns when a newer one appears, and stops warning when the
two agree again.

## Related docs

- [Development workflow](../../../docs/process/development.md) — `./gwp build`,
  `./gwp install` and the dev shell.
- [Object model](../../../docs/implementation/object-model.md)
