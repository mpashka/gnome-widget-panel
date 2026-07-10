#!/usr/bin/env bash
# @tag:ui-testing
#
# UI test harness library for GNOME Widget Panel. See docs/ui-testing.md.
#
# A test sources this file and calls `ui_start`; the harness then re-executes
# the test inside its own `dbus-run-session`, boots a fully isolated headless
# GNOME Shell (own D-Bus bus, own XDG_DATA_HOME extensions dir, own dconf
# profile, own widgets.json via GWP_CONFIG_FILE) with the panel extension and
# the test-driver extension (tests/ui/driver) enabled, and gives the test:
#
#   ui_eval 'JS'          run JS inside the shell (driver Eval; `find`, `panel`
#                         and `plugin(id)` helpers are pre-defined; a returned
#                         Promise is awaited); prints the JSON result
#   ui_eval_raw 'JS'      same, without the prelude
#   ui_wait_js 'EXPR' [s] poll until EXPR evals to true (default 10 s)
#   ui_set KEY VAL        gsettings set on the panel schema (test profile)
#   ui_get KEY            gsettings get on the panel schema
#   ui_click 'ACTOR_JS'   click the actor's center with a virtual pointer
#   ui_screenshot FILE    write a PNG of the whole stage
#   ui_config_write JSON  overwrite widgets.json (live-reload path)
#   assert_eq GOT WANT LABEL / assert_contains HAY NEEDLE LABEL /
#   assert_true 'EXPR' LABEL / fail MSG
#
# Nothing here touches the user's real session, config or dconf, except one
# throwaway dconf database file (~/.config/dconf/gwpuitest).
set -euo pipefail

GWP_UI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
GWP_UUID="gnome-widget-panel@mpashka.github.com"
GWP_DRIVER_UUID="gwp-test-driver@gwp.test"
GWP_SCHEMA="org.gnome.shell.extensions.floating-mini-panel"
GWP_UI_MONITOR="${GWP_UI_MONITOR:-1280x720}"
GWP_UI_BOOT_TIMEOUT="${GWP_UI_BOOT_TIMEOUT:-60}"

# JS prelude available to every ui_eval script.
GWP_JS_PRELUDE='const find=(a,f)=>{if(f(a))return a;for(const c of a.get_children()){const r=find(c,f);if(r)return r;}return null;};const panel=find(global.stage,x=>x.name==="FloatingMiniPanel");const plugin=id=>panel&&find(panel,x=>x._panelPluginId===id);'

_ui_log() { printf '%s\n' "$*" >&2; }

fail() {
    _ui_log "FAIL: $*"
    if [[ -n "${GWP_UI_TMP:-}" && -f "$GWP_UI_TMP/shell.log" ]]; then
        _ui_log "--- shell.log tail ---"
        tail -n 25 "$GWP_UI_TMP/shell.log" >&2 || true
    fi
    exit 1
}

# ---------------------------------------------------------------------------
# Session bootstrap
# ---------------------------------------------------------------------------

_ui_teardown() {
    local code=$?
    trap - EXIT INT TERM
    if [[ -n "${GWP_UI_SHELL_PID:-}" ]]; then
        kill "$GWP_UI_SHELL_PID" 2>/dev/null || true
        wait "$GWP_UI_SHELL_PID" 2>/dev/null || true
    fi
    if [[ $code -ne 0 || -n "${GWP_UI_KEEP:-}" ]]; then
        _ui_log "artifacts kept in: ${GWP_UI_TMP:-<none>}"
    elif [[ -n "${GWP_UI_TMP:-}" ]]; then
        rm -rf "$GWP_UI_TMP"
    fi
    exit "$code"
}

# ui_start [config-json]
# Re-execs the calling test under dbus-run-session, then boots the shell.
ui_start() {
    local config_json="${1:-$(_ui_default_config)}"

    if [[ -z "${GWP_UI_IN_SESSION:-}" ]]; then
        export GWP_UI_IN_SESSION=1
        exec dbus-run-session -- bash "$0"
    fi

    GWP_UI_TMP="$(mktemp -d /tmp/gwp-ui.XXXXXX)"
    export GWP_UI_TMP
    trap _ui_teardown EXIT INT TERM

    # Isolated extensions dir: panel build + test driver.
    export XDG_DATA_HOME="$GWP_UI_TMP/data"
    mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions"
    ln -sfn "$GWP_UI_ROOT/extension" \
        "$XDG_DATA_HOME/gnome-shell/extensions/$GWP_UUID"
    ln -sfn "$GWP_UI_ROOT/tests/ui/driver/$GWP_DRIVER_UUID" \
        "$XDG_DATA_HOME/gnome-shell/extensions/$GWP_DRIVER_UUID"

    # Isolated dconf profile (one throwaway db: ~/.config/dconf/gwpuitest).
    printf 'user-db:gwpuitest\n' > "$GWP_UI_TMP/dconf-profile"
    export DCONF_PROFILE="$GWP_UI_TMP/dconf-profile"
    export GSETTINGS_SCHEMA_DIR="$GWP_UI_ROOT/extension/schemas"

    # Isolated widget config. The panel's live-reload monitor watches the
    # directory of GWP_CONFIG_FILE and filters on that file's own basename, so
    # any name works; widgets.json is used for realism.
    mkdir -p "$GWP_UI_TMP/config"
    printf '%s\n' "$config_json" > "$GWP_UI_TMP/config/widgets.json"
    export GWP_CONFIG_FILE="$GWP_UI_TMP/config/widgets.json"

    [[ -d "$GWP_UI_ROOT/extension/schemas" ]] || \
        fail "extension/ not built; run npm run build (or tests/ui/run.sh)"
    rm -f "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gnome-shell-disable-extensions"

    # Reset every panel setting the tests rely on (the db persists across runs).
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell disable-extension-version-validation true \
        2>/dev/null || true
    gsettings set org.gnome.shell enabled-extensions \
        "['$GWP_UUID','$GWP_DRIVER_UUID']"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version '"999"' \
        2>/dev/null || true
    ui_set state 1
    ui_set orientation horizontal
    ui_set content-padding 0
    ui_set aligned 0
    ui_set pos-x 20
    ui_set pos-y 20

    gnome-shell --headless --virtual-monitor "$GWP_UI_MONITOR" \
        >"$GWP_UI_TMP/shell.log" 2>&1 &
    GWP_UI_SHELL_PID=$!

    _ui_wait_driver
    ui_wait_js 'panel !== null && panel.mapped' 20 \
        || fail "panel actor did not appear/map"
}

_ui_default_config() {
    cat <<'JSON'
{"schema":1,"plugins":[
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"clock","enabled":true},
  {"id":"gnome-action","enabled":true,"options":{"action":"overview"}}
]}
JSON
}

_ui_wait_driver() {
    local deadline=$((SECONDS + GWP_UI_BOOT_TIMEOUT)) out
    while ((SECONDS < deadline)); do
        kill -0 "$GWP_UI_SHELL_PID" 2>/dev/null || fail "gnome-shell exited during boot"
        out="$(ui_eval_raw '1+1' 2>/dev/null)" && [[ "$out" == "2" ]] && return 0
        sleep 0.5
    done
    fail "test driver did not come up within ${GWP_UI_BOOT_TIMEOUT}s"
}

# ---------------------------------------------------------------------------
# Shell interaction
# ---------------------------------------------------------------------------

# Evaluate JS in the shell (no prelude). Prints the JSON result.
# The driver base64-encodes the payload (see driver/…/extension.js), so the
# gdbus reply is always exactly "(true, 'BASE64')" / "(false, 'BASE64')" with a
# quote/backslash-free payload — safe to strip with sed and decode.
ui_eval_raw() {
    local out payload
    out="$(gdbus call --session --dest org.gwp.TestDriver \
        --object-path /org/gwp/TestDriver \
        --method org.gwp.TestDriver.Eval "$1" 2>&1)" || {
        _ui_log "ui_eval: gdbus call failed: $out"
        return 1
    }
    payload="$(printf '%s' "$out" \
        | sed -e "s/^(\(true\|false\), '//" -e "s/')\$//" | base64 -d)"
    if [[ "$out" == "(true, '"* ]]; then
        printf '%s\n' "$payload"
    else
        _ui_log "ui_eval: eval error: $payload"
        return 1
    fi
}

# Evaluate JS with the `find`/`panel`/`plugin(id)` prelude.
ui_eval() {
    ui_eval_raw "$GWP_JS_PRELUDE $1"
}

# Poll until a JS expression evaluates to true. ui_wait_js 'EXPR' [timeout_s]
ui_wait_js() {
    local expr="$1" timeout="${2:-10}" deadline out
    deadline=$((SECONDS + timeout))
    while ((SECONDS < deadline)); do
        out="$(ui_eval "!!($expr)" 2>/dev/null)" || out=""
        [[ "$out" == "true" ]] && return 0
        sleep 0.3
    done
    _ui_log "ui_wait_js: timed out after ${timeout}s waiting for: $expr"
    return 1
}

ui_set() { gsettings set "$GWP_SCHEMA" "$1" "$2"; }
ui_get() { gsettings get "$GWP_SCHEMA" "$1"; }

# Click the center of an actor with a virtual pointer device.
# ui_click "plugin('gnome-action')"
ui_click() {
    ui_eval "
        const a = ($1);
        if (!a) throw new Error('ui_click: actor not found');
        const [ax, ay] = a.get_transformed_position();
        const cx = ax + a.width / 2, cy = ay + a.height / 2;
        const seat = Clutter.get_default_backend().get_default_seat();
        globalThis._gwpVdev ??=
            seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const d = globalThis._gwpVdev;
        const t = () => global.get_current_time();
        d.notify_absolute_motion(t(), cx, cy);
        d.notify_button(t(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        d.notify_button(t(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        ({x: cx, y: cy})
    "
}

# Write a full-stage PNG. ui_screenshot /path/out.png
# The path is interpolated into a JS string literal, so reject characters that
# would break out of it (harness paths come from mktemp and are always safe).
ui_screenshot() {
    local path="$1"
    [[ "$path" == *"'"* || "$path" == *'\'* ]] && \
        fail "ui_screenshot: unsafe character in path: $path"
    ui_eval_raw "
        (async () => {
            const sc = new Shell.Screenshot();
            const [content] = await sc.screenshot_stage_to_content();
            const texture = content.get_texture();
            const stream = Gio.File.new_for_path('$path')
                .replace(null, false, Gio.FileCreateFlags.NONE, null);
            await new Promise((res, rej) =>
                Shell.Screenshot.composite_to_stream(
                    texture, 0, 0,
                    texture.get_width(), texture.get_height(),
                    1, null, 0, 0, 1, stream,
                    (o, r) => {
                        try {
                            Shell.Screenshot.composite_to_stream_finish(r);
                            res();
                        } catch (e) { rej(e); }
                    }));
            stream.close(null);
            return 'ok';
        })()
    " >/dev/null
    [[ -s "$path" ]] || fail "screenshot not written: $path"
}

# Overwrite widgets.json (triggers the panel's live-reload monitor).
ui_config_write() {
    printf '%s\n' "$1" > "$GWP_CONFIG_FILE"
}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

assert_eq() { # got want label
    [[ "$1" == "$2" ]] || fail "$3: expected '$2', got '$1'"
    _ui_log "ok - $3"
}

assert_contains() { # haystack needle label
    [[ "$1" == *"$2"* ]] || fail "$3: '$1' does not contain '$2'"
    _ui_log "ok - $3"
}

assert_true() { # js-expr label
    local out
    out="$(ui_eval "!!($1)")" || fail "$2: eval failed"
    [[ "$out" == "true" ]] || fail "$2: expected true, got '$out' for: $1"
    _ui_log "ok - $2"
}
