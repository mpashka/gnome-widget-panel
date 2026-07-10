# Bug analysis: panel GSettings do not apply live in dev shell

Back to the [docs index](index.md).

## Root cause + fix (CONFIRMED)

The remaining failure — the preferences window logs its write but the dev panel
never updates — was traced to the **environment of the preferences process**:

- The extension prefs run in `/usr/bin/gjs -m
  /usr/share/gnome-shell/org.gnome.Shell.Extensions`, which GNOME starts via
  **D-Bus activation with a fresh environment**. Reading `/proc/<pid>/environ`
  showed `DCONF_PROFILE` **unset** there, even though the dev `gnome-shell` was
  launched with `DCONF_PROFILE=<repo>/.dev/dconf-profile`.
- So the prefs wrote the **default** dconf profile while the dev shell read the
  isolated `gwpdev` profile. The write happened (hence the log line) but the dev
  panel, listening on a different profile, never saw the `changed::*` signal.
  `poke` worked because it writes with `DCONF_PROFILE` explicitly set.

**Fix:** `dev-run.sh` now runs `dbus-update-activation-environment --all` inside
the dev D-Bus session, so D-Bus-activated services (the prefs) inherit
`DCONF_PROFILE` / `XDG_DATA_HOME` / `GSETTINGS_SCHEMA_DIR`. Verified via
`/proc/<pid>/environ`: the prefs process now carries `DCONF_PROFILE=.dev/…`, so it
writes the same profile the dev shell reads. Open Settings from the dev window (or
`./dev-gsettings-diagnose.sh open-prefs`) and changes apply live. (Settings opened
from your MAIN session still write a different profile and will not apply here.)

> **Historical note (post-fix refactors).** This writeup was authored against an
> earlier config layout and its key/file names are kept verbatim as a forensic
> record. Since then: the two panel keys `vertical` + `vertical-rotation` were
> consolidated into one `orientation` enum (`horizontal` / `left` / `right`), and
> the widget config moved out of `~/.config/gnome-widget-panel/widgets.json` (with
> its `Gio.FileMonitor`) into the `widgets` GSettings key, live-reloaded by a
> `changed::widgets` handler. Read `vertical`/`vertical-rotation`/`widgets.json`
> below as "the panel-orientation keys" / "the widget config" in today's terms.

## Resolution (earlier steps — GSettings live-apply is correct code)

`dev-gsettings-diagnose.sh` settled it:

- `snapshot`: the main-session profile and the dev profile hold **different**
  values (`vertical=false` vs `vertical=true`) — the dconf isolation is real.
- `poke` (writes on the **dev shell's** session bus + profile) → the running dev
  panel changes orientation/padding and reverts. **GSettings live-apply works.**
- `open-prefs` (launches preferences on the **dev shell's** session bus) →
  changing Orientation/Content padding in that window **does** apply live.
- The same preferences window launched the ordinary way (main session bus /
  default profile) does **not** apply and `monitor` stays silent.

So the Shell-side live handlers in `FloatingMiniPanel` are correct. The failure is
purely that **`changed::*` notifications are delivered per session bus**, and the
dev shell runs on its own `dbus-run-session` bus with its own dconf profile. A
preferences window opened on any *other* bus writes a different dconf and its
change signal never reaches the nested panel. This is a dev-workflow artifact, not
a bug in the extension.

**Use in the dev workflow:** open preferences on the dev shell's bus —
`./dev-gsettings-diagnose.sh open-prefs`, or the panel's own **Settings…** item
(right-click the panel handle) inside the dev window, which the dev shell spawns
on its own bus. **For real testing** use `./install.sh` + logout/login, where the
preferences process and the shell share the one real session bus.

The original investigation notes follow.

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
- `Content padding` writes `content-padding` explicitly on `notify::value` and
  mirrors external `changed::content-padding` updates back into the row.

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

The helper [`../dev-gsettings-diagnose.sh`](../dev-gsettings-diagnose.sh)
wraps the same checks. `./dev-run.sh` writes the nested shell's
`DBUS_SESSION_BUS_ADDRESS` to `.dev/session-env`; keep `./dev-run.sh` running so
the helper can use the same session bus as the dev shell:

```bash
./dev-gsettings-diagnose.sh snapshot    # compare main-session vs dev values
./dev-gsettings-diagnose.sh monitor     # watch writes on the dev shell bus
./dev-gsettings-diagnose.sh poke        # write on the dev shell bus, then restore
./dev-gsettings-diagnose.sh open-prefs  # launch prefs on the dev shell bus
```

Interpretation:

- If `poke` changes the running panel, GSettings delivery to the dev shell works;
  the remaining problem is how the preferences window is launched or which
  profile it writes.
- If `poke` prints writes on `monitor` but does not change the running panel, the
  bug is in the Shell-side live-apply path.
- If `monitor` stays silent for a preferences window opened from the main
  session but prints changes for `open-prefs`, the cause is the profile used to
  launch preferences.
- If `monitor` and `poke` are run from outside the dev shell without the dev
  `DBUS_SESSION_BUS_ADDRESS`, they may read/write the same dconf profile without
  delivering live `changed::*` notifications to the nested shell. This is a dev
  subshell/session-bus artifact, not proof that the Shell handlers are broken.

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
