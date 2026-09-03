#!/usr/bin/env bash
# @tag:ui-testing
# Regression: the single `orientation` setting applies live: the panel flips
# horizontal <-> vertical and the graph widgets swap their size (rotate).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

assert_true 'panel.orientation === 0' "starts horizontal"
assert_true "plugin('cpu-load-monitor').width > plugin('cpu-load-monitor').height" \
    "cpu graph starts wide (unrotated)"

# The thickness the panel has lying down; the standing panel must be about as
# thick (see below).
HORIZONTAL_THICKNESS="$(ui_eval 'Math.round(panel.height)')"
_ui_log "horizontal thickness: $HORIZONTAL_THICKNESS px"

ui_set orientation right
ui_wait_js 'panel.orientation === 1' || fail "panel did not turn vertical (right)"
_ui_log "ok - orientation=right turns the panel vertical"
ui_wait_js "plugin('cpu-load-monitor').width < plugin('cpu-load-monitor').height" \
    || fail "cpu graph did not swap size when vertical"
_ui_log "ok - cpu graph rotated (tall/narrow) when vertical"
assert_true 'panel.width < panel.height' "panel strip is tall/narrow"
# Guard against unconstrained icon widths blowing the strip up (was 52px when
# St.Icon kept its natural 48px width; ~28px with the 24px CSS cap + padding).
assert_true 'panel.width <= 40' "vertical strip stays about one icon wide"
# The standing panel must be about as thick as the lying one is tall: letting
# the widest child decide made it noticeably fatter (28 px against 22 px), which
# is what the per-orientation CSS in stylesheet.css now prevents. A couple of
# pixels of slack, since the two axes round differently.
_ui_log "vertical thickness: $(ui_eval 'Math.round(panel.width)') px"
assert_true "Math.abs(panel.width - $HORIZONTAL_THICKNESS) <= 3" \
    "vertical thickness matches the horizontal one ($HORIZONTAL_THICKNESS px)"

ui_set orientation left
# The panel was already vertical, so assert the *direction* actually reached
# the widget (its rotate direction flips to 'left'), not just verticality.
ui_wait_js "plugin('cpu-load-monitor')._rotateDir === 'left'" \
    || fail "cpu graph did not switch to left rotation"
assert_true 'panel.orientation === 1' "orientation=left stays vertical"

ui_set orientation horizontal
ui_wait_js 'panel.orientation === 0' || fail "panel did not return horizontal"
ui_wait_js "plugin('cpu-load-monitor').width > plugin('cpu-load-monitor').height" \
    || fail "cpu graph did not restore after returning horizontal"
_ui_log "ok - horizontal restores panel and graph"
