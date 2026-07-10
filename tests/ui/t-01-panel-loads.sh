#!/usr/bin/env bash
# @tag:ui-testing
# Regression: the panel loads in a fresh shell, is visible, contains exactly
# the configured widgets (in order), and the extension logged no JS ERROR.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

assert_true 'panel.visible && panel.mapped' "panel visible and mapped"
assert_true 'panel.orientation === 0' "panel starts horizontal"

ids="$(ui_eval 'panel.get_children().map(c => c._panelPluginId ?? c.constructor?.name)')"
assert_eq "$ids" '["ControlButton","cpu-load-monitor","clock","gnome-action"]' \
    "control button + configured widgets in config order"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
