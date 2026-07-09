# Developer workflow: reload without logout

`@tag:dev`

Reinstalling with [`install.sh`](../install.sh) copies files and then needs a
logout/login on Wayland to take effect. That is because **GNOME Shell caches an
extension's ES module for the life of the `gnome-shell` process**: disabling and
re-enabling the extension re-runs `enable()`/`disable()` but reuses the already
imported code. New code is only loaded by a fresh shell process. On X11 that is
`Alt+F2` → `r`; on Wayland the session shell cannot be restarted in place.

The developer workflow loads new code in a second, throwaway `gnome-shell`
process — running in a window — that you can restart freely.

## One-time setup

```bash
sudo apt install mutter-dev-bin   # provides /usr/libexec/mutter-devkit
./dev-install.sh                  # or: npm run dev:install
```

`dev-install.sh` builds and symlinks the built tree into an **isolated dev
extensions dir** — `<repo>/.dev/data/gnome-shell/extensions/<uuid>` — **not** your
main session's `~/.local/share/gnome-shell/extensions/`. The dev shell loads it
from there via `XDG_DATA_HOME` (see below), so the widget is never installed into
your main session. After this, every `npm run build` is immediately live on disk;
only a shell (re)start loads it. (`dev-run.sh` also (re)creates this symlink each
run, so running `dev-install.sh` first is optional.)

## Reload loop

```bash
./dev-run.sh              # or: npm run dev
```

Each run `dev-run.sh`:

1. rebuilds and recompiles the schema;
2. symlinks the built tree into the isolated dev extensions dir
   (`.dev/data/gnome-shell/extensions/<uuid>`);
3. starts an interactive nested GNOME Shell **in a window** via
   `gnome-shell --devkit`, **fully isolated from your main session**:
   `XDG_DATA_HOME=<repo>/.dev/data` (its own extensions set — your main
   session's extensions dir is untouched and need not contain this widget) and
   `DCONF_PROFILE=gwpdev` (its own panel GSettings);
4. verifies the extension loaded (prints `ENABLED`);
5. tails the extension's log until you close the window or press `Ctrl+C`.

Because the dev shell reads panel GSettings from its own dconf profile, edit the
panel's **Settings from within the dev window** (right-click the panel handle →
Settings…) — a settings window opened from your main session writes a different
dconf and will not reach the dev shell.

The panel appears inside the nested window; interact with it directly. Reload:
edit sources, close the window (or `Ctrl+C`), rerun `./dev-run.sh`. Optionally
keep `npm run watch` for continuous TypeScript compilation (asset changes still
need a build, which `dev-run.sh` does each launch).

### Window size

The devkit window renders the whole nested shell (the floating panel lives
inside it, so it cannot be reduced to just the panel). It opens at the devkit's
default virtual monitor (1600×1000); there is no launch flag/env to change that.
To shrink and freely resize it, open the window's primary menu → **Monitors** →
**Emulate monitor modes**, then drag the window edge — the virtual monitor and
the shell layout follow the window size. Because this is a *floating* mini panel,
you can then drag the panel to a convenient corner of the smaller window.

The full log is at `/tmp/gnome-widget-panel-dev.log` (override with `GWP_LOG`);
the terminal shows only extension/error lines.

### Parallel run (dev shell alongside a separate main-session install)

The dev shell is isolated from your main session (separate extensions dir + dconf
profile), so the two never interfere. If you ALSO install the widget into your
main session (`./install.sh` + logout/login) and want both running live, give the
dev widget a different Claude port so they don't clash on the localhost port:

```bash
GWP_CLAUDE_PORT=17862 ./dev-run.sh
```

- `GWP_CLAUDE_PORT=N` generates an isolated `.dev/widgets.json` (copied from your
  config) with `ai-agent-usage`'s `claudePort` set to `N`, and points the dev
  shell at it via `GWP_CONFIG_FILE` (a config-path override honored by
  `configStore.ts`). Pick a port different from your main session (default
  `17861`).

Because the Claude hook registry lives under `~/.claude` (shared), both instances
register their `{port, secret}` and Claude's status line fans out to both (see
the ai-agent-usage widget's Claude hook docs). Same port on both still clashes;
different ports do not.

### Why devkit (mutter 50 specifics)

mutter 50 removed the windowed `--nested` flag; `gnome-shell --wayland` (with or
without a parent compositor, even inside `cage`/`weston`) runs its native backend
and fails with `EBUSY` trying to take the seat. The supported replacement is the
mutter development kit: `gnome-shell --devkit` hosts a nested shell in a GTK
window, provided by `/usr/libexec/mutter-devkit` (package `mutter-dev-bin`).
`enabled-extensions` is one per-user setting, so the dev shell runs under its own
`DCONF_PROFILE` to be enabled only there while `widgets.json` stays shared.

## Alternatives

- **Headless, log only.** `GWP_HEADLESS=1 ./dev-run.sh` runs the shell headless
  with a virtual monitor (`GWP_MONITOR_SPEC`, default `1600x900`) and just tails
  the log — enough to confirm the extension loads and behaves without a window.
  Scripted screenshots are not available (`org.gnome.Shell.Screenshot` returns
  `AccessDenied` to external callers since GNOME 45), and headless RDP needs the
  system `gnome-remote-desktop` service, so headless mode here is log-only.
- **GNOME on Xorg.** Log in once choosing “GNOME on Xorg”, then reload the real
  shell with `Alt+F2` → `r` → Enter — no logout per change. X11 only.

## Notes and caveats

- A shell killed mid-startup leaves `$XDG_RUNTIME_DIR/gnome-shell-disable-extensions`,
  which forces safe mode (all extensions off) next time. `dev-run.sh` removes it
  on start and on exit.
- Dev-only artifacts (the isolated extensions dir `data/`, dconf profile, inner
  script, status file) live under `.dev/` and are gitignored.
- The dev extensions dir is separate from your main session, so dev work never
  installs, enables, or disables the widget in your main session. For a real
  main-session install use [`install.sh`](../install.sh) (copies into
  `~/.local/share/gnome-shell/extensions/`) + logout/login — independent of the
  dev setup. Do NOT use `install.sh` for iterating; it copies (freezing the code)
  and needs a logout/login each time.

Back to the [docs index](index.md) and [architecture](architecture.md).
