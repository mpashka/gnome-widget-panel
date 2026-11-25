#!/usr/bin/env bash
# @tag:ui-testing @tag:main-panel
# A monitor change (moving the laptop between the office monitor and its own
# screen) runs LayoutManager._monitorsChanged, which puts the GNOME top bar back
# at the monitor top and makes it visible. With `main-panel = hide` the bar must
# go away again; a bar height change (another scale) must not let it peek out.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

BOX="Main.layoutManager.panelBox"
HIDDEN="!$BOX.visible && $BOX.y + $BOX.height <= Main.layoutManager.primaryMonitor.y"

ui_set main-panel hide
ui_wait_js "$HIDDEN" || fail "main-panel hide did not hide the top bar"
_ui_log "ok - the top bar is hidden"

ui_eval "Main.layoutManager._monitorsChanged(); true" >/dev/null
assert_true "$HIDDEN" "the top bar stays hidden after a monitor change"

ui_eval "$BOX.set_height($BOX.height * 2); true" >/dev/null
assert_true "$HIDDEN" "a taller bar is hidden in full"
ui_eval "$BOX.set_height(-1); true" >/dev/null

ui_eval "$BOX.show(); true" >/dev/null
assert_true "!$BOX.visible" "a stray visibility update does not show the hidden bar"

ui_set main-panel visible
ui_wait_js "$BOX.visible && $BOX.y === Main.layoutManager.primaryMonitor.y" \
    || fail "main-panel visible did not bring the top bar back: $(ui_eval "[$BOX.visible, $BOX.y, $BOX.height, Main.layoutManager.primaryMonitor.y].join()")"
ui_eval "Main.layoutManager._monitorsChanged(); true" >/dev/null
assert_true "$BOX.visible && $BOX.y === Main.layoutManager.primaryMonitor.y" \
    "a visible top bar stays where it is after a monitor change"
