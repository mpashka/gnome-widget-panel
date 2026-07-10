#!/usr/bin/env bash
# @tag:dev
#
# Run the extension in a second, throwaway GNOME Shell in a window, without
# logging out of your session.
#
# Why a second shell: GNOME Shell caches an extension's ES module for the life of
# its process, so changed code is only loaded by a fresh process. mutter 50
# dropped the old windowed "nested" flag and `gnome-shell --wayland` tries to
# take the seat (fails with EBUSY). The supported replacement is the mutter
# development kit: `gnome-shell --devkit` runs a fully interactive nested shell
# in a window (needs the `mutter-dev-bin` package).
#
# Isolation: the dev shell is fully separate from your main GNOME session:
#   - it loads extensions from its own dir (XDG_DATA_HOME=<root>/.dev/data), so
#     the widget is NEVER installed into your main session's extensions dir;
#   - it reads panel GSettings from its own dconf profile (DCONF_PROFILE=gwpdev).
# So the main session and this dev shell have completely separate extension sets;
# nothing you do here touches your main session, and the widget need not be
# installed there at all.
#
# Reload: edit sources, close the devkit window (or Ctrl+C here), rerun.
# Env knobs: GWP_HEADLESS=1 runs headless + log only (no window);
# GWP_MONITOR_SPEC sizes the headless virtual monitor (default 1600x900);
# GWP_LOG overrides the full shell log path.
#
# Parallel run with a separate main-session install (both live): if you also
# ./install.sh the widget into your main session, use GWP_CLAUDE_PORT=N to run
# this dev widget on a different Claude port so they don't clash on the localhost
# port (the ~/.claude hook registry is shared, so Claude's status line fans out
# to both). Example:  GWP_CLAUDE_PORT=17862 ./dev-run.sh
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./dev-run.sh [OPTIONS]

Rebuild the extension and run it in a throwaway nested GNOME Shell
(gnome-shell --devkit window), fully isolated from your main session
(own D-Bus bus, extensions dir and dconf profile). Ctrl+C (or closing
the window) stops it; rerun to reload changed code.

Options:
  --theme light|dark   Switch the dev shell's colour scheme (sets
                       org.gnome.desktop.interface color-scheme in the dev
                       dconf profile: light = 'default', dark = 'prefer-dark').
                       Persists in the dev profile until changed again.
  -h, --help           Show this help and exit.

Environment knobs:
  GWP_HEADLESS=1       Headless + log only (no window).
  GWP_MONITOR_SPEC=WxH Headless virtual monitor size (default 1600x900).
  GWP_LOG=PATH         Full shell log path (default /tmp/gnome-widget-panel-dev.log).
  GWP_CLAUDE_PORT=N    Run the dev ai-agent-usage widget on Claude port N (the
                       port is patched into the dev dconf profile's widget
                       config; useful parallel to a main-session install).

Panel settings (orientation, content padding, position) apply live only from a
preferences window on the dev shell's bus: use the panel's own Settings... item
inside the dev window, or ./dev-gsettings-diagnose.sh open-prefs.
See docs/development.md and docs/ui-testing.md.
EOF
}

theme=""
while (($# > 0)); do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        --theme) shift; theme="${1:-}" ;;
        --theme=*) theme="${1#*=}" ;;
        *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done
case "$theme" in
    ''|light|dark) ;;
    *) printf -- '--theme must be "light" or "dark", got: %s\n' "$theme" >&2; exit 2 ;;
esac

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
spec="${GWP_MONITOR_SPEC:-1600x900}"
headless="${GWP_HEADLESS:-0}"
claude_port="${GWP_CLAUDE_PORT:-}"
logfile="${GWP_LOG:-/tmp/gnome-widget-panel-dev.log}"
runtime="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
devkit_bin="/usr/libexec/mutter-devkit"

devdir="$root/.dev"
profile="$devdir/dconf-profile"
statusfile="$devdir/status"
sessionenv="$devdir/session-env"
inner="$devdir/inner.sh"
# Isolated extensions dir: the dev shell loads extensions from here via
# XDG_DATA_HOME, so the widget stays entirely out of your main GNOME session's
# extensions dir. The two sessions have completely separate extension sets.
datahome="$devdir/data"
shell_pid=""

cleanup() {
    trap - INT TERM EXIT
    [[ -n "$shell_pid" ]] && kill "$shell_pid" 2>/dev/null || true
    [[ -n "$shell_pid" ]] && wait "$shell_pid" 2>/dev/null || true
    rm -f "$runtime/gnome-shell-disable-extensions" "$sessionenv"
    printf '\nDev shell stopped. Rerun ./dev-run.sh to reload.\n'
}
trap cleanup INT TERM EXIT

# --- Pick the shell mode ---------------------------------------------------
if [[ "$headless" != "1" && ! -x "$devkit_bin" ]]; then
    printf 'Interactive mode needs the mutter development kit (%s).\n' "$devkit_bin" >&2
    printf 'Install it with:  sudo apt install mutter-dev-bin\n' >&2
    printf 'Or run log-only:  GWP_HEADLESS=1 ./dev-run.sh\n' >&2
    exit 1
fi
if [[ "$headless" == "1" ]]; then
    shell_cmd=(gnome-shell --headless --virtual-monitor "$spec")
    mode_desc="headless ($spec), log only"
else
    shell_cmd=(gnome-shell --devkit)
    mode_desc="interactive devkit window"
fi

# --- Build fresh code for the new shell ------------------------------------
"$root/build.sh"
glib-compile-schemas "$root/extension/schemas"

# --- Isolated extensions dir (XDG_DATA_HOME) -------------------------------
# Symlink the built tree into the dev-only extensions dir so the dev shell loads
# it without ever installing into your main session's extensions dir. The main
# session and this dev shell therefore have completely separate extension sets.
mkdir -p "$datahome/gnome-shell/extensions"
ln -sfn "$root/extension" "$datahome/gnome-shell/extensions/$uuid"

# --- Dev-only settings (isolated dconf profile) ----------------------------
mkdir -p "$devdir"
printf 'user-db:gwpdev\n' >"$profile"
: >"$statusfile"

# Optional: give the dev ai-agent-usage widget its own Claude port. The widget
# configuration lives in the `widgets` GSettings key of the dev shell's isolated
# dconf profile, so we patch the claudePort right in that profile (read current
# value or default, modify, write back). ~/.claude (the hook registry) stays
# under HOME, so the Claude status-line fan-out reaches both this instance and
# your main session.
claude_port_cmd=""
if [[ -n "$claude_port" ]]; then
    # GJS helper (the project's native stack): reads/patches the `widgets` JSON
    # in the dev dconf profile via Gio.Settings directly. Env (DCONF_PROFILE,
    # GSETTINGS_SCHEMA_DIR) comes from the inner script that invokes it.
    cat >"$devdir/patch-claude-port.js" <<'JS'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import system from 'system';

const [portArg] = system.programArgs;
const port = Number(portArg);
const schemaDir = GLib.getenv('GSETTINGS_SCHEMA_DIR');
const source = Gio.SettingsSchemaSource.new_from_directory(
    schemaDir, Gio.SettingsSchemaSource.get_default(), false);
const schema = source.lookup(
    'org.gnome.shell.extensions.floating-mini-panel', false);
const settings = new Gio.Settings({settings_schema: schema});

let data = null;
try {
    const raw = settings.get_string('widgets');
    data = raw ? JSON.parse(raw) : null;
} catch (e) {
    data = null;
}
if (!data || !Array.isArray(data.plugins)) {
    // Empty/broken key: the built-in default widget set (keep in sync with
    // widgetConfig.defaultWidgetConfig).
    data = {schema: 1, plugins: [
        {id: 'gnome-action', enabled: true},
        {id: 'gnome-menu', enabled: true},
        {id: 'favorites', enabled: true},
        {id: 'keyboard-layout', enabled: true},
        {id: 'app-notifications', enabled: true},
        {id: 'cpu-load-monitor', enabled: true},
        {id: 'ai-agent-usage', enabled: true},
        {id: 'clock', enabled: true},
        {id: 'ubuntu-system-status', enabled: true},
        {id: 'printscreen', enabled: false},
    ]};
}
let ai = data.plugins.find(p => p.id === 'ai-agent-usage');
if (!ai) {
    ai = {id: 'ai-agent-usage', enabled: true};
    data.plugins.push(ai);
}
ai.enabled = true;
ai.options = {...(ai.options ?? {}), claudePort: port};
settings.set_string('widgets', JSON.stringify(data));
Gio.Settings.sync();
JS
    printf 'Dev widget Claude port: %s (patched into the dev dconf profile)\n' "$claude_port"
    claude_port_cmd="gjs -m \"$devdir/patch-claude-port.js\" \"$claude_port\" || true"
fi

# Optional --theme: write the colour scheme into the dev dconf profile (the
# inner script exports DCONF_PROFILE, so this only affects the dev shell).
theme_cmd=""
if [[ "$theme" == "dark" ]]; then
    theme_cmd="gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark' 2>/dev/null || true"
    printf 'Dev shell theme: dark (prefer-dark)\n'
elif [[ "$theme" == "light" ]]; then
    theme_cmd="gsettings set org.gnome.desktop.interface color-scheme 'default' 2>/dev/null || true"
    printf 'Dev shell theme: light (default)\n'
fi

cat >"$inner" <<INNER
#!/usr/bin/env bash
set -u
# Isolated extensions dir so the dev shell never touches the main session's.
export XDG_DATA_HOME="$datahome"
export DCONF_PROFILE="$profile"
export GSETTINGS_SCHEMA_DIR="$root/extension/schemas"

# Propagate the dev environment to D-Bus-activated services. The extension
# preferences app (org.gnome.Shell.Extensions) is D-Bus-activated with a FRESH
# environment, so without this it runs with no DCONF_PROFILE and writes the
# DEFAULT dconf profile while the dev shell reads the isolated one — the reason
# preference changes never reach the running panel. This makes the prefs inherit
# DCONF_PROFILE/XDG_DATA_HOME/GSETTINGS_SCHEMA_DIR, so its writes reach this shell.
dbus-update-activation-environment --all 2>/dev/null || true

umask 077
cat >"$sessionenv" <<SESSION_ENV
export DBUS_SESSION_BUS_ADDRESS="\$DBUS_SESSION_BUS_ADDRESS"
export DCONF_PROFILE="$profile"
export GSETTINGS_SCHEMA_DIR="$root/extension/schemas"
export XDG_DATA_HOME="$datahome"
SESSION_ENV
rm -f "$runtime/gnome-shell-disable-extensions"

# Enable only this extension in the isolated profile.
gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null || true
gsettings set org.gnome.shell enabled-extensions "['$uuid']" 2>/dev/null || true
${theme_cmd}
${claude_port_cmd}

${shell_cmd[*]} >>"$logfile" 2>&1 &
shell_pid=\$!
for i in \$(seq 1 60); do
    gdbus introspect --session --dest org.gnome.Shell \
        --object-path /org/gnome/Shell >/dev/null 2>&1 && break
    sleep 0.5
done
sleep 2
state=\$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Extensions.GetExtensionInfo "$uuid" 2>/dev/null \
    | grep -oE "'state': <[0-9.]+>" | grep -oE '[0-9]+' | head -1)
echo "EXT_STATE=\${state:-?}" >>"$statusfile"

wait \$shell_pid
INNER
chmod +x "$inner"

# --- Launch ----------------------------------------------------------------
rm -f "$runtime/gnome-shell-disable-extensions"
: >"$logfile"
printf 'Starting %s; full log -> %s\n' "$mode_desc" "$logfile"
dbus-run-session -- "$inner" &
shell_pid=$!

ext_state=""
for _ in $(seq 1 80); do
    kill -0 "$shell_pid" 2>/dev/null || break
    ext_state="$(sed -n 's/^EXT_STATE=//p' "$statusfile" 2>/dev/null)"
    [[ -n "$ext_state" ]] && break
    sleep 0.5
done

echo
case "$ext_state" in
    1) printf 'Extension %s: ENABLED in the dev shell.\n' "$uuid" ;;
    "") printf 'Extension %s: state unknown (shell still starting?).\n' "$uuid" ;;
    *) printf 'Extension %s: NOT enabled (state=%s) — check the log.\n' "$uuid" "$ext_state" ;;
esac
if [[ "$headless" != "1" ]]; then
    printf 'A nested GNOME Shell window should be open; the panel is inside it.\n'
    printf 'To shrink/resize it: window menu (menu) -> Monitors -> Emulate monitor\n'
    printf 'modes, then drag the window edge (the shell reflows to the new size).\n'
fi
printf '\nSettings: open the panel'"'"'s own **Settings...** item (right-click the panel\n'
printf 'handle) INSIDE this window, or run  ./dev-gsettings-diagnose.sh open-prefs.\n'
printf 'Those run on this dev shell (its D-Bus activation env carries DCONF_PROFILE),\n'
printf 'so orientation/content-padding/position now apply live. Preferences opened\n'
printf 'from your MAIN session write a different dconf and still will NOT apply here.\n'
printf 'For a real install use ./install.sh + logout/login.\n'

printf '\nTailing extension/error log lines; Ctrl+C to stop.\n\n'
tail -n +1 -f --pid="$shell_pid" "$logfile" 2>/dev/null \
    | grep --line-buffered -iE 'widget[ -]?panel|ai.agent|extension|error|exception|warning|fatal' \
    || true
