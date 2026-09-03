#!/usr/bin/env bash
# @tag:widget-gnome-menu @tag:ui-testing
# The applications menu must be exactly the same size whatever category is
# selected, and must fit on the monitor.
#
# Why: the popup is anchored to the panel, so one that grows with the selected
# category pushes its own category rows out from under the pointer; the pointer
# then hovers the neighbouring category, that one resizes it back, and the menu
# visibly shakes. With the panel at the bottom the popup grows upwards, so a long
# category ("Internet") also ran off the top of the screen.
# See extension-src/plugins/gnome-menu/index.ts _updateMenuHeight.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[{"id":"gnome-menu","enabled":true}]}'

ui_wait_js "plugin('gnome-menu') !== null && plugin('gnome-menu')._content !== null" \
    || fail "gnome-menu did not appear with its two-pane content"

count="$(ui_eval "plugin('gnome-menu')._categoryButtons.length")"
[[ "$count" -ge 2 ]] \
    || fail "need at least two categories to prove the size is stable, got $count"
_ui_log "ok - menu built with $count categories"

# The size the popup asks for, per category. Preferred height/width are computed
# synchronously, so this measures every category without waiting for a paint.
sizes="$(ui_eval "(() => {
    const menu = plugin('gnome-menu');
    menu._menu.open();
    return menu._categoryButtons.map(({category}) => {
        menu._selectCategory(category);
        return [
            menu._menu.box.get_preferred_width(-1)[1],
            menu._menu.box.get_preferred_height(-1)[1],
        ].join('x');
    });
})()")"

unique="$(printf '%s' "$sizes" | tr ',' '\n' | tr -d '[]\" ' | sort -u)"
if [[ "$(printf '%s\n' "$unique" | wc -l)" -ne 1 ]]; then
    fail "the popup resizes with the selected category (it would shake): $sizes"
fi
_ui_log "ok - every category asks for the same popup size ($unique)"

# ... and that one size fits the monitor's work area.
assert_true "(() => {
    const menu = plugin('gnome-menu');
    const monitor = Main.layoutManager.findMonitorForActor(menu) ??
        Main.layoutManager.primaryMonitor;
    const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
    return menu._menu.box.get_preferred_height(-1)[1] < workArea.height;
})()" "the popup fits inside the monitor work area"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
