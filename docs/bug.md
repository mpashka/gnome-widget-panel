# Bug analysis: panel GSettings do not apply live in dev shell

Back to the [docs index](index.md).

## Symptom

When the working development copy is started with `./dev-run.sh`, changing widget
order in the preferences UI applies live, but changing these panel-level rows
does not visibly affect the running panel:

- `Orientation`
- `Content padding`

These rows are panel-level GSettings, not widget options in `widgets.json`.

## Expected path

`extension-src/prefs.ts` writes both values through `this.getSettings()`:

- `Orientation` writes `vertical` and, for vertical modes, `vertical-rotation`.
- `Content padding` is bound to `content-padding` with
  `Gio.SettingsBindFlags.DEFAULT`.

`extension-src/extension.ts` constructs `FloatingMiniPanel` with the same
GSettings object and installs live listeners:

- `changed::vertical` calls `_setOrientation(...)`, pushes panel layout to
  plugins, then calls `_relocate(false)`.
- `changed::vertical-rotation` pushes panel layout to plugins and relocates.
- `changed::content-padding` refreshes `_contentPadding` and calls
  `_relocate(false)`, which reaches `_adjustBorder(...)`; `_adjustBorder(...)`
  writes the inline `padding: Npx` style.

So the runtime code is designed to apply these keys live once the preferences
process and the nested shell are using the same GSettings backend/profile.

## Current evidence

The preferences UI can reorder widgets while the dev shell is running. That
means the preferences process can write the shared
`~/.config/gnome-widget-panel/widgets.json`, and the nested panel's
`Gio.FileMonitor` can see and apply that file change.

That evidence does **not** prove that `Orientation` and `Content padding` are
using the same live-apply path. They do not. Widget order, enabled state and
per-widget options are persisted in `widgets.json`; panel orientation and content
padding are persisted in GSettings. A failure limited to `Orientation` and
`Content padding` is therefore a GSettings/live-handler problem, not a generic
configuration problem.

## Lower-probability profile mismatch

One common failure mode is specific to the `./dev-run.sh` workflow. The
development shell is started under an isolated dconf profile:

```bash
export DCONF_PROFILE="$profile"
```

`dev-run.sh` writes that profile to `.dev/dconf-profile` and enables the
extension only there. This is intentional: the nested shell has its own dconf
state while `widgets.json` stays shared.

If the preferences window is opened from the main session, for example with:

```bash
gnome-extensions prefs gnome-widget-panel@mpashka.github.com
```

then `prefs.ts` can write `vertical`, `vertical-rotation`, and `content-padding` to
the main session's normal dconf profile, not to the dev shell's isolated
`gwpdev` profile. The nested `FloatingMiniPanel` is listening to the isolated
profile, so it never receives the `changed::*` signals and continues reading its
old values.

This still explains a narrow class of failures that affect only `Orientation`
and `Content padding`, because both are GSettings keys. Widget add/remove/reorder
and per-widget options can apply even in this mismatch case because they are
persisted in the shared `~/.config/gnome-widget-panel/widgets.json` file and
reloaded by the file monitor.

However, the profile-mismatch explanation should not be treated as the leading
conclusion without checking the dev profile directly. If the dev profile changes
when the UI is edited, the preferences process is writing to the right dconf
profile and the bug is in the Shell-side live handler path in `FloatingMiniPanel`.

## Leading runtime suspects

If `gsettings monitor` sees the dev-profile key changes, instrument the Shell
side before changing preferences code:

- `changed::vertical` should call `_setOrientation(...)`,
  `_applyPanelLayoutToPlugins()` and `_relocate(false)`.
- `changed::vertical-rotation` should call `_applyPanelLayoutToPlugins()` and
  `_relocate(false)`.
- `changed::content-padding` should refresh `_contentPadding` and call
  `_relocate(false)`.
- `_relocate(false)` should reach `_adjustBorder(...)`.
- `_adjustBorder(...)` should set `this.style` to include `padding: Npx;` when
  the configured frame is greater than zero.

Useful runtime logs would include the key name, new value, whether the signal
handler ran, `this[this.orientStr]`, actor size before/after relayout, and the
final inline `this.style`.

## Existing workflow warning

`dev-run.sh` already prints the operational warning after the dev shell starts:

> Panel settings (orientation, content padding, position) are read from that
> profile. Open Settings FROM THIS DEV WINDOW ... Settings opened from your MAIN
> session write a DIFFERENT dconf and will NOT apply here.

The documentation also notes that the dev shell uses an isolated dconf profile.
This warning is still useful, but widget reorder applying live is expected even
when only the shared `widgets.json` path is working.

## Practical check

Run this from the repository root while the dev shell is open:

```bash
DCONF_PROFILE=$PWD/.dev/dconf-profile \
GSETTINGS_SCHEMA_DIR=$PWD/extension/schemas \
gsettings monitor org.gnome.shell.extensions.floating-mini-panel
```

Then change `Orientation` and `Content padding` in the preferences UI you are
actually using.

- If the monitor prints `vertical`, `vertical-rotation`, or `content-padding`,
  the preferences process is using the dev profile and the bug is in the
  runtime application path.
- If the monitor is silent while the UI changes, the preferences process is
  writing to the wrong profile.

## Practical workaround for the profile-mismatch case

Open the settings from inside the nested dev shell window: right-click the panel
handle and choose `Settings...`. That preferences process is launched from the
dev shell path and should use the dev shell profile, so the GSettings writes
reach the running dev panel.

For testing the normal installed extension, use `./install.sh` and log out/log
in on Wayland.

## Fix direction

First identify which branch of the check above applies.

If the monitor is silent, make the dev workflow harder to misuse. Reasonable
options:

- Document the dconf-profile caveat in `docs/preferences.md` next to the panel
  settings section.
- Add a small helper command/script that opens preferences with
  `DCONF_PROFILE=.dev/dconf-profile`, matching the dev shell profile.
- Make `dev-run.sh` print an exact command for opening dev-profile preferences
  from a separate terminal, if launching from the nested window is unreliable.

If the monitor prints key changes, fix the Shell runtime path instead. The
inspected code shows the expected listeners exist, so the likely failure is that
one of those handlers is not firing in the nested shell, `_relocate(false)` is
using stale geometry/orientation while applying the setting, or the inline style
change is overwritten or not relaid out visibly.
