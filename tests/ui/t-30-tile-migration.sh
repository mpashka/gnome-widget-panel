#!/usr/bin/env bash
# @tag:ui-testing
# The removed Quick Settings tile's Permanent mode hid the GNOME top bar on its
# own. On enable it is carried over once into `main-panel = hide`, so upgrading
# does not bring the top bar back; any other mode leaves `main-panel` alone.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

reenable() {
    ui_eval "Main.extensionManager.disableExtension('$GWP_UUID'); true" >/dev/null
    ui_eval "Main.extensionManager.enableExtension('$GWP_UUID'); true" >/dev/null
    ui_wait_js "find(global.stage, x => x.name === 'ctlBtn') !== null" \
        || fail "the panel did not come back after re-enabling"
}

ui_set main-panel visible
ui_set state 1
reenable
assert_eq "$(ui_get main-panel)" "'hide'" "Permanent becomes main-panel hide"
assert_eq "$(ui_get state)" "0" "the migration runs once"
_ui_log "ok - Permanent carried over into main-panel"

ui_set main-panel visible
reenable
assert_eq "$(ui_get main-panel)" "'visible'" "a later visible is left alone"

ui_set state 2
reenable
assert_eq "$(ui_get main-panel)" "'visible'" "Automatic does not hide the top bar"
_ui_log "ok - other modes leave main-panel alone"
