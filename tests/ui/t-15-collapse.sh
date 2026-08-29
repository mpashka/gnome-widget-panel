#!/usr/bin/env bash
# @tag:ui-testing
# The Collapse/Expand context-menu item on the drag handle (`ctlBtn`): collapsing
# leaves only the handle on screen, its menu still opens (that is the only way
# back), the state persists in the `collapsed` GSettings key, and expanding
# restores every widget. Replaces the removed right-button long-press that hid
# the whole panel for 5s (see t-10 and controlButton.ts LONGPRESS_MS).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

CTL_BTN="find(panel, x => x.name === 'ctlBtn')"
# The menu item is identified by its label, so the test also pins the label the
# user actually reads.
ITEM_BY_LABEL="(text => ($CTL_BTN).menu._getMenuItems().find(i => i.side?.text === text))"

assert_true "plugin('clock') !== null && plugin('clock').visible" \
    "clock visible before collapsing"
assert_eq "$(ui_get collapsed)" "false" "panel starts expanded"

# --- collapse -------------------------------------------------------------
assert_true "$ITEM_BY_LABEL('Collapse') !== undefined" \
    "the menu offers 'Collapse' while expanded"

ui_eval "$ITEM_BY_LABEL('Collapse').emit('activate', null); true" >/dev/null
ui_wait_js "!plugin('clock').visible" \
    || fail "activating 'Collapse' did not hide the widgets"
assert_eq "$(ui_get collapsed)" "true" "collapsing persists in the collapsed key"
_ui_log "ok - Collapse hides the widgets"

assert_true "($CTL_BTN).visible && panel.visible && panel.mapped" \
    "the drag handle and the panel itself stay visible when collapsed"
assert_true "panel.get_children().every(c => c === $CTL_BTN || !c.visible)" \
    "nothing but the drag handle is visible when collapsed"
_ui_log "ok - only the drag handle (caption) remains"

# The context menu must still work while collapsed — it is the only way back.
ui_click_button "$CTL_BTN" Clutter.BUTTON_SECONDARY 0 >/dev/null
ui_wait_js "($CTL_BTN).menu.isOpen" \
    || fail "the drag handle's context menu does not open while collapsed"
assert_true "$ITEM_BY_LABEL('Expand') !== undefined" \
    "the item is relabelled 'Expand' while collapsed"
_ui_log "ok - collapsed panel still opens its context menu, offering Expand"

# --- expand ---------------------------------------------------------------
ui_eval "$ITEM_BY_LABEL('Expand').emit('activate', null); true" >/dev/null
ui_wait_js "plugin('clock').visible" \
    || fail "activating 'Expand' did not bring the widgets back"
assert_eq "$(ui_get collapsed)" "false" "expanding clears the collapsed key"
assert_true "panel.get_children().every(c => c.visible)" \
    "every child is visible again after expanding"
_ui_log "ok - Expand restores every widget"

# --- collapsed state survives a widget live-reload ------------------------
# A settings edit rebuilds the plugin actors; freshly built actors are visible
# by default, so the panel must re-apply the collapsed state to them.
ui_eval "$ITEM_BY_LABEL('Collapse').emit('activate', null); true" >/dev/null
ui_wait_js "!plugin('clock').visible" || fail "second collapse did not apply"
ui_config_write '{"schema":1,"plugins":[
  {"id":"clock","enabled":true},
  {"id":"gnome-action","enabled":true}]}'
ui_wait_js "plugin('cpu-load-monitor') === null" 15 \
    || fail "the widget config did not live-reload"
assert_true "!plugin('clock').visible" \
    "widgets rebuilt while collapsed stay hidden"
_ui_log "ok - a live config reload does not silently expand the panel"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
