#!/usr/bin/env bash
# @tag:ui-testing
# Regression: editing widgets.json live-reloads the widget set (the panel's
# Gio.FileMonitor + debounce path), without crashing the panel; and a broken
# config is ignored (the panel keeps its current widgets).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

has() { # widget id present?
    ui_eval "plugin('$1') !== null"
}

assert_eq "$(has clock)" "true" "clock present initially"

# Remove the clock.
ui_config_write '{"schema":1,"plugins":[
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"gnome-action","enabled":true}]}'
ui_wait_js "plugin('clock') === null" 15 || fail "clock did not disappear after config edit"
assert_true 'panel.mapped' "panel alive after removing a widget"
_ui_log "ok - removing a widget live-reloads"

# Add favorites.
ui_config_write '{"schema":1,"plugins":[
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"favorites","enabled":true},
  {"id":"gnome-action","enabled":true}]}'
ui_wait_js "plugin('favorites') !== null" 15 || fail "favorites did not appear after config edit"
_ui_log "ok - adding a widget live-reloads"

# Broken JSON must not tear the panel down.
ui_config_write '{"schema":1,"plugins":[{BROKEN'
sleep 2
assert_true "panel.mapped && plugin('favorites') !== null" \
    "broken config ignored, panel keeps current widgets"
