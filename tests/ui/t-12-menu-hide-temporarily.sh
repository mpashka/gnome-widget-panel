#!/usr/bin/env bash
# @tag:ui-testing
# The control button's context menu has a "Hide for 5 seconds" item that runs
# the same temporary-hide as a long right-click on the drag handle
# (controlButton.ts -> FloatingMiniPanel._tmpHide). Open the menu directly
# (independent of the right-click gesture), activate that item by its label, and
# assert the panel hides and then reappears after the timeout.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

CTL_BTN="find(panel, x => x.name === 'ctlBtn')"

assert_true "panel.visible" "panel visible at start"

ui_eval "
    const b = ($CTL_BTN);
    if (!b) throw new Error('ctlBtn not found');
    b.menu.open();
    const item = b.menu._getMenuItems().find(
        i => i.side && i.side.text === 'Hide for 5 seconds');
    if (!item) throw new Error('\\'Hide for 5 seconds\\' menu item not found');
    item.activate(null);
    'activated'
" >/dev/null

ui_wait_js "!panel.visible" \
    || fail "'Hide for 5 seconds' menu item did not hide the panel"
_ui_log "ok - menu item hides the panel (same as long right-click)"

ui_wait_js "panel.visible" 8 \
    || fail "panel did not reappear after the temporary-hide timeout"
_ui_log "ok - panel reappears after the temporary-hide timeout"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
