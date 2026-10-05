#!/usr/bin/env bash
# @tag:ui-testing
# Measure gnome-shell CPU per panel configuration in an isolated headless
# session, so nothing touches the real desktop. See docs/testing/cpu-cost.md.
#
#   cpu-bench.sh <scenario> [settle_s] [measure_s]
#
# Scenarios:
#   bare            no extensions at all (shell baseline)
#   empty           panel loaded, zero widgets
#   w:<id>[,<id>]   panel with exactly these widgets
#   real            the owner's actual widget set
#   pulse           ai-agent-status alone, forced into its pulsing state
#   nopulse         ai-agent-status alone with the 600 ms pulse timer released
#   notick          ai-agent-status alone with both of its timers released
#   others          the owner's other enabled extensions, panel off
#   all             those others plus the panel with the real widget set
#
# Prints one line marked RESULT:  RESULT <scenario> shell=<%core> …
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
UUID="gnome-widget-panel@mpashka.github.com"
DRIVER_UUID="gwp-test-driver@gwp.test"
SCHEMA="org.gnome.shell.extensions.floating-mini-panel"
MONITOR="${GWP_UI_MONITOR:-1280x720}"

SCENARIO="${1:?scenario}"
SETTLE="${2:-20}"
MEASURE="${3:-60}"

# The widget set to compare against: one real configuration, pasted from
# `gsettings get … widgets`. Override with GWP_REAL_WIDGETS.
REAL_WIDGETS="${GWP_REAL_WIDGETS:-gnome-menu,keyboard-layout,app-notifications,ai-agent-status,clock,printscreen,ubuntu-system-status,break-timer,version-status}"

widgets_json() {
    local ids="$1" first=1
    printf '{"schema":1,"plugins":['
    IFS=',' read -ra arr <<< "$ids"
    for id in "${arr[@]}"; do
        [[ -z "$id" ]] && continue
        ((first)) || printf ','
        first=0
        printf '{"id":"%s","enabled":true}' "$id"
    done
    printf ']}'
}

if [[ -z "${IN_SESSION:-}" ]]; then
    export IN_SESSION=1
    exec dbus-run-session -- bash "$0" "$@"
fi

TMP="$(mktemp -d /tmp/gwp-cpu.XXXXXX)"
cleanup() {
    [[ -n "${SHELL_PID:-}" ]] && { kill "$SHELL_PID" 2>/dev/null || true; wait "$SHELL_PID" 2>/dev/null || true; }
    [[ -n "${GWP_KEEP:-}" ]] && echo "artifacts: $TMP" >&2 || rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

export XDG_STATE_HOME="$TMP/state"; mkdir -p "$XDG_STATE_HOME"
export XDG_DATA_HOME="$TMP/data"; mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions"
ln -sfn "$ROOT/extension" "$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
ln -sfn "$ROOT/tests/ui/driver/$DRIVER_UUID" "$XDG_DATA_HOME/gnome-shell/extensions/$DRIVER_UUID"
printf 'user-db:gwpcpubench\n' > "$TMP/dconf-profile"
export DCONF_PROFILE="$TMP/dconf-profile"
export GSETTINGS_SCHEMA_DIR="$ROOT/extension/schemas"

gsettings reset-recursively "$SCHEMA"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell disable-extension-version-validation true 2>/dev/null || true
gsettings set org.gnome.shell welcome-dialog-last-shown-version '"999"' 2>/dev/null || true

# Whatever else the real session runs, for comparison — read once from
# `gsettings get org.gnome.shell enabled-extensions` and pasted here.
OTHERS="'ubuntu-appindicators@ubuntu.com','apps-menu@gnome-shell-extensions.gcampax.github.com','places-menu@gnome-shell-extensions.gcampax.github.com','status-icons@gnome-shell-extensions.gcampax.github.com','system-monitor@gnome-shell-extensions.gcampax.github.com','tiling-assistant@ubuntu.com','snapd-search-provider@canonical.com','web-search-provider@ubuntu.com','ding@rastersoft.com'"

PANEL_ON=1
EXTENSIONS="['$UUID','$DRIVER_UUID']"
case "$SCENARIO" in
    bare)   PANEL_ON=0; EXTENSIONS="['$DRIVER_UUID']"; CONFIG='' ;;
    others) PANEL_ON=0; EXTENSIONS="[$OTHERS,'$DRIVER_UUID']"; CONFIG='' ;;
    empty)  CONFIG="$(widgets_json '')" ;;
    real)   CONFIG="$(widgets_json "$REAL_WIDGETS")" ;;
    pulse|nopulse|notick) CONFIG="$(widgets_json 'ai-agent-status')" ;;
    all)    EXTENSIONS="[$OTHERS,'$UUID','$DRIVER_UUID']"; CONFIG="$(widgets_json "$REAL_WIDGETS")" ;;
    w:*)    CONFIG="$(widgets_json "${SCENARIO#w:}")" ;;
    *)      echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac

gsettings set org.gnome.shell enabled-extensions "$EXTENSIONS"

if ((PANEL_ON)); then
    gsettings set "$SCHEMA" widgets "$CONFIG"
    gsettings set "$SCHEMA" state 0
    gsettings set "$SCHEMA" orientation horizontal
    gsettings set "$SCHEMA" pos-x 20
    gsettings set "$SCHEMA" pos-y 20
    # The collector of the real session owns port 17861 and the ~/.claude
    # status-line slot; a second one must not fight it.
    gsettings set "$SCHEMA" ai-collector false
fi

rm -f "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gnome-shell-disable-extensions"

gnome-shell --headless --virtual-monitor "$MONITOR" >"$TMP/shell.log" 2>&1 &
SHELL_PID=$!

eval_js() {
    local out payload
    out="$(gdbus call --session --dest org.gwp.TestDriver \
        --object-path /org/gwp/TestDriver \
        --method org.gwp.TestDriver.Eval "$1" 2>&1)" || return 1
    payload="$(printf '%s' "$out" | sed -e "s/^(\(true\|false\), '//" -e "s/')\$//" | base64 -d)"
    [[ "$out" == "(true, '"* ]] || { echo "eval error: $payload" >&2; return 1; }
    printf '%s\n' "$payload"
}

deadline=$((SECONDS + 90))
while ((SECONDS < deadline)); do
    kill -0 "$SHELL_PID" 2>/dev/null || { echo "shell exited during boot" >&2; tail -20 "$TMP/shell.log" >&2; exit 1; }
    [[ "$(eval_js '1+1' 2>/dev/null)" == 2 ]] && break
    sleep 0.5
done

PRELUDE='const find=(a,f)=>{if(f(a))return a;for(const c of a.get_children()){const r=find(c,f);if(r)return r;}return null;};const panel=find(global.stage,x=>x.name==="FloatingMiniPanel");const plugin=id=>panel&&find(panel,x=>x._panelPluginId===id);'

sleep "$SETTLE"

case "$SCENARIO" in
    pulse)
        # Force the agent-status dot into the pulsing state the real session
        # shows whenever a Claude/Codex session is promptable. The 5 s tick
        # rebuilds the dot from the collector state, which would drop a plain
        # `_pulses = true`, so the rebuild itself is wrapped.
        eval_js "$PRELUDE const w=plugin('ai-agent-status'); const o=w._rebuildDots.bind(w); w._rebuildDots=()=>{o(); w._dots.forEach(d=>{d._pulses=true;}); w._syncPulseTimer?.();}; w._rebuildDots(); 'forced:'+w._dots.filter(d=>d._pulses).length+' timer:'+!!w._pulseTimeoutId" >&2
        sleep 3
        ;;
    nopulse)
        # Same widget with its 600 ms pulse timer released: what is left is the
        # 5 s dot rebuild alone.
        eval_js "$PRELUDE const w=plugin('ai-agent-status'); imports.gi.GLib.Source.remove(w._pulseTimeoutId); w._pulseTimeoutId=0; 'pulse timer released'" >&2
        sleep 3
        ;;
    notick)
        # And with the 5 s rebuild released too: the widget then costs nothing.
        eval_js "$PRELUDE const w=plugin('ai-agent-status'); const G=imports.gi.GLib; G.Source.remove(w._pulseTimeoutId); G.Source.remove(w._tickTimeoutId); w._pulseTimeoutId=0; w._tickTimeoutId=0; 'both timers released'" >&2
        sleep 3
        ;;
esac

hz="$(getconf CLK_TCK)"
read_cpu() { awk '{print $14+$15}' "/proc/$SHELL_PID/stat"; }
t0="$(read_cpu)"
sleep "$MEASURE"
t1="$(read_cpu)"
awk -v d="$((t1 - t0))" -v hz="$hz" -v m="$MEASURE" -v s="$SCENARIO" -v st="$SETTLE" \
    'BEGIN{printf "RESULT %-22s shell=%6.2f%% of one core   settle=%ss measure=%ss\n", s, 100*d/hz/m, st, m}'
