#!/usr/bin/env bash
# @tag:ui-testing
# Regression for issue #4: opening a sibling widget's menu (here `favorites`'
# Places menu, sharing the real `Main.panel.menuManager`) and then merely
# hovering the pointer over the control button — the panel's drag handle —
# must NOT steal that menu and pop the control button's own context menu open
# instead. `Main.panel.menuManager` switches the active menu to whichever
# registered menu's source actor the pointer enters next (the same mechanism
# that lets you hover from the Wi-Fi menu to the Bluetooth menu in the real
# top bar); the control button's context menu used to share that manager, so
# crossing it while another menu was open silently closed that menu. See
# docs/object-model.md#controlbutton.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"favorites","enabled":true}
]}'

# Structural check: the control button's context menu is on its own private
# PopupMenuManager, not the shared one every real top-bar indicator (and the
# `favorites`/`gnome-menu` widgets) register with.
assert_true "!Main.panel.menuManager._menus.includes(panel._ctlBtn.menu)" \
    "control button context menu is not on the shared menu manager"
assert_true "Main.panel.menuManager._menus.includes(plugin('favorites')._menu)" \
    "favorites menu still uses the shared menu manager (unaffected)"

# Behavioural check: open the sibling "favorites" (Places) menu with a real
# pointer click, then hover the control button without clicking it.
ui_click "plugin('favorites')" >/dev/null
ui_wait_js "plugin('favorites')._menu.isOpen" \
    || fail "favorites menu did not open on click"

ui_hover "panel._ctlBtn" >/dev/null
# Give any (wrongly firing) menu-switch a moment to happen before asserting.
sleep 0.3

assert_true "plugin('favorites')._menu.isOpen" \
    "favorites menu stays open after hovering the control button"
assert_true "!panel._ctlBtn.menu.isOpen" \
    "control button context menu did not open from the hover"
