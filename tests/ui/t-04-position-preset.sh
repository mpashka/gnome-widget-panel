#!/usr/bin/env bash
# @tag:ui-testing
# Regression: the `aligned` position presets snap the panel live.
# Bitfield: TOP 1, BOTTOM 2, LEFT 4, RIGHT 8, CENTER 16. Expected positions are
# derived from the stage size inside the eval'd JS, so the test holds for any
# GWP_UI_MONITOR geometry.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

ui_set aligned 17   # TOP | CENTER
ui_wait_js 'panel.y <= 2 &&
        Math.abs((panel.x + panel.width / 2) - global.stage.width / 2) <= 4' \
    || fail "TOP|CENTER did not snap (got $(ui_eval '({x: panel.x, y: panel.y, w: panel.width, stage: global.stage.width})'))"
_ui_log "ok - TOP|CENTER snaps to top center"

ui_set aligned 10   # BOTTOM | RIGHT
ui_wait_js 'Math.abs((panel.x + panel.width) - global.stage.width) <= 2 &&
        Math.abs((panel.y + panel.height) - global.stage.height) <= 2' \
    || fail "BOTTOM|RIGHT did not snap (got $(ui_eval '({x: panel.x, y: panel.y, w: panel.width, h: panel.height, sw: global.stage.width, sh: global.stage.height})'))"
_ui_log "ok - BOTTOM|RIGHT snaps to bottom right"

ui_set aligned 0    # Floating: keeps whatever position it has, no snapping
sleep 1
assert_true 'panel.mapped' "panel still alive after returning to floating"
