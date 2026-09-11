#!/usr/bin/env bash
# @tag:ui-testing
# Regression for issue #3: a real (if slightly slow) right-click on the
# drag/move handle (`ctlBtn`) must open its context menu — not get
# misclassified as a long-press. Before the fix, CtlActions used a 250ms
# click-vs-long-press threshold; an ordinary right-click held for ~300ms
# (routine for a touchpad secondary-click) exceeded it, so the release was
# treated as a long-press and hid the whole panel for 5s instead of opening the
# menu (looked like the widget "flickering/reloading"). That temporary-hide has
# since been removed in favour of the explicit Collapse/Expand menu item, so the
# tail of this test now pins that a long right-press does nothing at all.
# See controlButton.ts LONGPRESS_MS.
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

# The header identifies the build the shell is actually running: the version and
# release channel, and under it the commit from build-stamp.json (with `-dirty`
# when that tree had uncommitted changes). Between releases the version alone is
# the same string for every build, so the commit is the part that answers "is
# this the change I just made". Stacked on two lines so the row does not outgrow
# the menu — the menu may not answer a long value by cutting it (UX rule 14).
HEADER="($CTL_BTN).menu.firstMenuItem.hotkeyLabel.text"
ui_wait_js "$HEADER.length > 0" || fail "the menu header never got its version"
assert_true "/^[0-9]+\.[0-9]+\.[0-9]+/.test($HEADER)" \
    "the menu header names the version"
STAMP="$GWP_UI_ROOT/extension/build-stamp.json"
COMMIT="$(sed -n 's/.*\"commit\": *\"\([^\"]*\)\".*/\1/p' "$STAMP")"
if [[ -n "$COMMIT" ]]; then
    assert_true "$HEADER.includes('$COMMIT')" \
        "the menu header names the commit the running build came from"
    # Two lines, not one long one: the row must not outgrow the menu.
    assert_true "$HEADER.split(String.fromCharCode(10)).length === 2" \
        "the version and the commit are stacked, not joined into one wide line"
else
    _ui_log "ok - no commit in the build stamp (built outside a checkout), header is version-only"
fi

ui_click_button "$CTL_BTN" Clutter.BUTTON_SECONDARY 0 >/dev/null
ui_wait_js "!($CTL_BTN).menu.isOpen" \
    || fail "a quick right-click did not close the (now open) context menu"
_ui_log "ok - a further quick right-click closes the menu again"

# A long right-press must now do NOTHING. The temporary-hide it used to trigger
# was removed: an invisible panel with no visible trigger and no setting is not
# something a user can find or undo. Hiding the widgets is an explicit menu
# action instead (Collapse/Expand — see t-15-collapse.sh).
ui_click_button "$CTL_BTN" Clutter.BUTTON_SECONDARY 600 >/dev/null
sleep 2
assert_true "panel.visible" \
    "a long right-press no longer hides the panel (temporary-hide removed)"
assert_eq "$(ui_get collapsed)" "false" \
    "a long right-press does not collapse the panel either"
_ui_log "ok - long right-press is inert; hiding is an explicit menu action"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
