#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-break-timer @tag:widget-app-notifications @tag:widget-ubuntu-system-status
# What a widget must survive in the VERTICAL strip, from three bugs seen there:
#   * the break-timer graph was allocated 12 of the strip's 20px (the side
#     margin never swapped with the orientation) and kept drawing its requested
#     32x16, so the last of its stacked bars — the yellow daily one — fell off
#     the edge and showed as a single pixel;
#   * every cloned tray icon is its own `.btn`, whose vertical padding stacked
#     on the icon's own and pushed neighbouring app-notification icons 44px
#     apart;
#   * a cloned quick-settings label ("100%") needs 40px, so in the 20px strip
#     Pango ellipsized it to a bare "…" — three dots and no reading.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"break-timer","enabled":true,"options":{}},
  {"id":"app-notifications","enabled":true},
  {"id":"ubuntu-system-status","enabled":true}
]}'

ui_set orientation right
ui_wait_js 'panel.orientation === 1' || fail "the panel did not turn vertical"
ui_wait_js "plugin('break-timer')._rotated === true" \
    || fail "the break-timer graph was not told the panel is vertical"

# --- the graph gets the strip's full thickness, and draws into it -----------
strip="$(ui_eval "panel.width")"
graph="$(ui_eval "plugin('break-timer').get_allocation_box().get_width()")"
[[ "$graph" -ge 16 ]] \
    || fail "the graph got ${graph}px of the ${strip}px strip, less than its 16px thickness"
_ui_log "ok - the graph gets ${graph}px of the ${strip}px strip"

# The drawing box itself follows the surface rather than the requested size, so
# a narrower allocation scales the bars instead of pushing the last one off the
# edge; that mapping is pinned by tests/panelRotation.test.mjs.

# --- cloned tray icons are not pushed apart --------------------------------
# A fake application indicator, since a headless session has no tray apps. The
# drawer clones anything whose role starts with 'appindicator'.
ui_eval "(async () => {
    const PanelMenu = await import('resource:///org/gnome/shell/ui/panelMenu.js');
    const button = new PanelMenu.Button(0.5, 'appindicator-fake');
    button.add_child(new St.Icon({
        icon_name: 'dialog-information-symbolic',
        style_class: 'system-status-icon',
    }));
    Main.panel.addToStatusArea('appindicator-fake', button, 0, 'right');
    return 'added';
})()" >/dev/null || fail "could not add a fake application indicator"

ui_wait_js "(() => {
    const drawer = find(panel, x => x.name === 'IndicatorsDrawer');
    return drawer && find(drawer, x => x.name === 'extBtn') !== null;
})()" 15 || fail "the fake indicator was never cloned into the drawer"

clone_height="$(ui_eval "(() => {
    const drawer = find(panel, x => x.name === 'IndicatorsDrawer');
    return find(drawer, x => x.name === 'extBtn').get_allocation_box().get_height();
})()")"
# 44px was the bug; the quick-settings icons in the same strip sit 28px apart.
[[ "$clone_height" -le 32 ]] \
    || fail "a cloned tray icon takes ${clone_height}px of the strip (was 44px, wanted <= 32)"
_ui_log "ok - a cloned tray icon takes ${clone_height}px of the strip"

# --- a cloned quick-settings label reads down the strip ---------------------
# The battery percentage is hidden in a headless session; show it, so the label
# the bug was about actually exists.
ui_eval "(() => {
    let shown = 0;
    for (const ind of Main.panel.statusArea.quickSettings._indicators) {
        if (ind._percentageLabel) {
            ind._percentageLabel.text = '100%';
            ind._percentageLabel.visible = true;
            shown += 1;
        }
    }
    return shown;
})()" >/dev/null

ui_wait_js "(() => {
    const quick = find(panel, x => x.name === 'quickBtn');
    return quick.get_children().some(c => typeof c.setPanelLayout === 'function');
})()" || fail "the quick button has no drawn label to turn"

assert_true "(() => {
    const quick = find(panel, x => x.name === 'quickBtn');
    const label = quick.get_children().find(c => typeof c.setPanelLayout === 'function');
    // Turned: the text runs ALONG the strip, and costs it only its glyph
    // height — an upright label would be 40px wide and ellipsize to '…'.
    return label._rotated === true &&
        label.height > label.width &&
        label.width <= panel.width;
})()" "the cloned quick-settings label turns with the strip instead of ellipsizing"

# --- back to horizontal, unchanged -----------------------------------------
ui_set orientation horizontal
ui_wait_js 'panel.orientation === 0' || fail "the panel did not return horizontal"
assert_true "(() => {
    const g = plugin('break-timer');
    const box = g.get_allocation_box();
    return g._rotated === false && box.get_width() >= 32 && box.get_height() >= 16;
})()" "the graph is back to its full size in a horizontal panel"

assert_true "(() => {
    const quick = find(panel, x => x.name === 'quickBtn');
    const label = quick.get_children().find(c => typeof c.setPanelLayout === 'function');
    return label._rotated === false && label.width > label.height;
})()" "the cloned label reads across in a horizontal panel"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
