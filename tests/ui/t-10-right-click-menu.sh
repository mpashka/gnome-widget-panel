#!/usr/bin/env bash
# @tag:ui-testing
# Regression for issue #3: a real (if slightly slow) right-click on the
# drag/move handle (`ctlBtn`) must open its context menu — not get
# misclassified as a long-press. Before the fix, CtlActions used a 250ms
# click-vs-long-press threshold; an ordinary right-click held for ~300ms
# (routine for a touchpad secondary-click) exceeded it, so the release was
# treated as a long-press and fired `_rightBtnLongPress()` ->
# `FloatingMiniPanel._tmpHide()` (extension.ts), hiding the whole panel for
# 5s instead of opening the menu (looked like the widget "flickering/
# reloading"). See controlButton.ts LONGPRESS_MS.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

CTL_BTN="find(panel, x => x.name === 'ctlBtn')"

assert_true "!($CTL_BTN).menu.isOpen" "menu starts closed"

ui_click_button "$CTL_BTN" Clutter.BUTTON_SECONDARY 300 >/dev/null
ui_wait_js "($CTL_BTN).menu.isOpen" \
    || fail "a 300ms-held right-click did not open the context menu"
assert_true "panel.visible" \
    "panel stays visible after a slightly-held right-click (no false long-press)"
_ui_log "ok - 300ms right-click opens the context menu instead of misfiring long-press"

ui_click_button "$CTL_BTN" Clutter.BUTTON_SECONDARY 0 >/dev/null
ui_wait_js "!($CTL_BTN).menu.isOpen" \
    || fail "a quick right-click did not close the (now open) context menu"
_ui_log "ok - a further quick right-click closes the menu again"

# A genuine long-press must still trigger the (unrelated, working-as-designed)
# temporary-hide feature, so the fix only widens the click/long-press boundary
# rather than disabling long-press detection.
ui_click_button "$CTL_BTN" Clutter.BUTTON_SECONDARY 600 >/dev/null
ui_wait_js "!panel.visible" \
    || fail "a genuine long-press (600ms) no longer triggers the temporary-hide feature"
_ui_log "ok - a genuine long-press still triggers the temporary-hide feature"

ui_wait_js "panel.visible" 8 \
    || fail "panel did not reappear after the temporary-hide timeout"
_ui_log "ok - panel reappears after the temporary-hide timeout"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
