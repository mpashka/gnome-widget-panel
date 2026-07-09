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
# Isolation: the dev shell uses its own dconf profile, so the extension is
# enabled only here while `widgets.json` stays shared. The extension is also
# disabled in your main session first (it is a per-user setting and the widget
# binds a localhost port), so the two shells never fight over it.
#
# Reload: edit sources, close the devkit window (or Ctrl+C here), rerun.
# Env knobs: GWP_HEADLESS=1 runs headless + log only (no window);
# GWP_MONITOR_SPEC sizes the headless virtual monitor (default 1600x900);
# GWP_LOG overrides the full shell log path.
#
# Parallel run (dev shell alongside your main session, both live):
#   GWP_KEEP_MAIN=1   do NOT disable the extension in your main session.
#   GWP_CLAUDE_PORT=N run the dev widget on Claude port N via an isolated
#                     widgets.json (copied from yours), so it does not clash on
#                     the localhost port with your main session (default 17861).
#   The Claude hook registry (~/.claude) is shared, so Claude's status line fans
#   out to BOTH instances. Example:
#     GWP_KEEP_MAIN=1 GWP_CLAUDE_PORT=17862 ./dev-run.sh
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
uuid="gnome-widget-panel@mpashka.github.com"
spec="${GWP_MONITOR_SPEC:-1600x900}"
headless="${GWP_HEADLESS:-0}"
keep_main="${GWP_KEEP_MAIN:-0}"
claude_port="${GWP_CLAUDE_PORT:-}"
logfile="${GWP_LOG:-/tmp/gnome-widget-panel-dev.log}"
runtime="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
devkit_bin="/usr/libexec/mutter-devkit"

devdir="$root/.dev"
profile="$devdir/dconf-profile"
statusfile="$devdir/status"
inner="$devdir/inner.sh"
shell_pid=""

cleanup() {
    trap - INT TERM EXIT
    [[ -n "$shell_pid" ]] && kill "$shell_pid" 2>/dev/null || true
    [[ -n "$shell_pid" ]] && wait "$shell_pid" 2>/dev/null || true
    rm -f "$runtime/gnome-shell-disable-extensions"
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

# --- Main session extension: disable, unless keeping it for a parallel run --
if [[ "$keep_main" == "1" ]]; then
    printf 'Keeping %s enabled in your main session (parallel run).\n' "$uuid"
    if [[ -z "$claude_port" ]] &&
        gnome-extensions list --enabled 2>/dev/null | grep -qx "$uuid"; then
        printf 'Note: without GWP_CLAUDE_PORT both instances share the same '
        printf 'Claude port and will clash on it (handled, non-fatal).\n'
    fi
elif gnome-extensions list --enabled 2>/dev/null | grep -qx "$uuid"; then
    printf 'Disabling %s in your main session to avoid a second instance.\n' "$uuid"
    gnome-extensions disable "$uuid" 2>/dev/null || true
fi

# --- Dev-only settings (isolated dconf profile) ----------------------------
mkdir -p "$devdir"
printf 'user-db:gwpdev\n' >"$profile"
: >"$statusfile"

# Optional isolated widgets.json so the dev widget uses a different Claude port.
# We point the dev shell at it via GWP_CONFIG_FILE (a config-path override honored
# by configStore.ts) — this leaves dconf/XDG untouched, so extension enablement
# still works. ~/.claude (the hook registry) stays under HOME, so the Claude
# status-line fan-out reaches both this instance and your main session.
cfg_export=""
if [[ -n "$claude_port" ]]; then
    devcfg="$devdir/widgets.json"
    src="$HOME/.config/gnome-widget-panel/widgets.json"
    [[ -f "$src" ]] || src="$root/extension/config/widgets.json"
    python3 - "$src" "$devcfg" "$claude_port" <<'PY'
import json, sys
src, dst, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
data = json.load(open(src))
plugins = data.setdefault("plugins", [])
ai = next((p for p in plugins if p.get("id") == "ai-agent-usage"), None)
if ai is None:
    ai = {"id": "ai-agent-usage", "enabled": True}
    plugins.append(ai)
ai["enabled"] = True
ai.setdefault("options", {})["claudePort"] = port
open(dst, "w").write(json.dumps(data, indent=2) + "\n")
PY
    printf 'Dev widget Claude port: %s (config %s)\n' "$claude_port" "$devcfg"
    cfg_export="export GWP_CONFIG_FILE=\"$devcfg\""
fi

cat >"$inner" <<INNER
#!/usr/bin/env bash
set -u
${cfg_export}
export DCONF_PROFILE="$profile"
rm -f "$runtime/gnome-shell-disable-extensions"

# Enable only this extension in the isolated profile.
gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null || true
gsettings set org.gnome.shell enabled-extensions "['$uuid']" 2>/dev/null || true

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
printf '\n*** IMPORTANT: this dev shell uses an ISOLATED dconf profile (%s). ***\n' "$profile"
printf 'Panel settings (orientation, content padding, position) are read from that\n'
printf 'profile. Open Settings FROM THIS DEV WINDOW (right-click the panel handle ->\n'
printf 'Settings...) so your changes reach this shell. Settings opened from your MAIN\n'
printf 'session write a DIFFERENT dconf and will NOT apply here (this is the usual\n'
printf 'reason "orientation shows Horizontal but the panel is Vertical" and changes\n'
printf 'seem to do nothing). To test the real install instead: ./install.sh + logout/login.\n'

printf '\nTailing extension/error log lines; Ctrl+C to stop.\n\n'
tail -n +1 -f --pid="$shell_pid" "$logfile" 2>/dev/null \
    | grep --line-buffered -iE 'widget[ -]?panel|ai.agent|extension|error|exception|warning|fatal' \
    || true
