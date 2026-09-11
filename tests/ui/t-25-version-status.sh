#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-version-status
# The developer version-status widget in a running shell: it finds the build
# stamp beside the extension (the part unit tests cannot check — the path is
# derived from import.meta.url), reports the build it is running, and raises the
# relogin warning as soon as a NEWER build appears on disk, still naming the
# build that is actually running. The stamp file is swapped for a future one to
# stand in for an install that happened after login, and restored afterwards.
#
# It is also a warning that is only on screen while it stands (UX rule 15), so
# the widget's visibility is part of the verdict: present but invisible while the
# running build is the installed one, on screen while a relogin is pending. That
# is why the refresh below is called directly instead of clicking the button —
# an invisible actor takes no clicks.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

ui_start '{"schema":1,"plugins":[{"id":"version-status","enabled":true}]}'

ui_wait_js "plugin('version-status') !== null" || fail "version-status did not appear"
W='plugin("version-status")'

STAMP="$GWP_UI_ROOT/extension/build-stamp.json"
[[ -f "$STAMP" ]] || fail "no build-stamp.json in the built tree (./gwp build writes it)"
STAMP_BACKUP="$(cat "$STAMP")"
RUNNING_LABEL="$(printf '%s' "$STAMP_BACKUP" \
    | sed -n 's/.*"label": *"\([^"]*\)".*/\1/p')"
[[ -n "$RUNNING_LABEL" ]] || fail "build-stamp.json carries no label"

# The stamp is a build artifact, but leaving a future one behind would make
# every later run of this shell think a relogin is due. Restore it whatever
# happens, keeping the test's own exit code for the harness teardown.
_restore_stamp() { printf '%s' "$STAMP_BACKUP" >"$STAMP"; }
trap 'code=$?; _restore_stamp; (exit $code); _ui_teardown' EXIT INT TERM

# --- the shell is running what is on disk ---------------------------------
ui_wait_js "$W._stateClass === 'version-status-current'" \
    || fail "the widget did not recognise the installed build as the running one"
_ui_log 'ok - it finds the build stamp beside the extension'
assert_contains "$(ui_eval "$W._tooltip.text")" "Running the installed build: $RUNNING_LABEL" \
    'the tooltip names the running build'
assert_eq "$(ui_eval "$W.visible")" "false" \
    'nothing to warn about, nothing on screen'
assert_true 'panel.mapped' 'the panel is alive with the widget hidden'

# --- a build that lands after login means a relogin is pending ------------
printf '{"label":"9.9.9 (future)","builtAt":"2099-01-01T00:00:00+0000","builtAtMs":%s}\n' \
    "$(( $(date +%s%3N) + 600000 ))" >"$STAMP"
ui_eval "$W._refresh()" >/dev/null
ui_wait_js "$W._stateClass === 'version-status-stale'" \
    || fail "a newer build on disk did not raise the relogin warning"
_ui_log 'ok - a build newer than the running modules raises the warning'
ui_wait_js "$W.visible === true" || fail "the warning was raised but stayed off screen"
_ui_log 'ok - the warning puts the widget back on screen'
tooltip="$(ui_eval "$W._tooltip.text")"
assert_contains "$tooltip" '9.9.9 (future)' 'the tooltip names the installed build'
assert_contains "$tooltip" "Running: $RUNNING_LABEL" 'it still knows which build is running'
assert_contains "$tooltip" 'Log out and log back in' 'it says what to do about it'

# --- and it goes back once the two agree again ----------------------------
_restore_stamp
ui_eval "$W._refresh()" >/dev/null
ui_wait_js "$W._stateClass === 'version-status-current'" \
    || fail "the warning stayed after the installed build matched again"
ui_wait_js "$W.visible === false" || fail "the cleared warning kept its panel slot"
_ui_log 'ok - the warning clears when the build on disk is the running one again'

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
