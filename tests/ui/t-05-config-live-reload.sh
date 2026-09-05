#!/usr/bin/env bash
# @tag:ui-testing
# Regression: editing the `widgets` GSettings key live-reloads the widget set
# (the panel's changed::widgets + debounce path), without crashing the panel;
# and a broken config is ignored (the panel keeps its current widgets).
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

# Editing ONE widget must not restart the others. Every edit rewrites the whole
# `widgets` key, and rebuilding every actor threw away the state the untouched
# widgets had accumulated (a graph's history, a bound port, a running counter)
# while the panel re-settled around them — which is what the flicker seen when
# editing the break timer's options was. Mark both actors, change only
# favorites' options, and check that only favorites was rebuilt.
ui_eval "plugin('cpu-load-monitor')._reloadProbe = 42; plugin('favorites')._reloadProbe = 42" >/dev/null
ui_config_write '{"schema":1,"plugins":[
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"favorites","enabled":true,"options":{"iconSize":18}},
  {"id":"gnome-action","enabled":true}]}'
ui_wait_js "plugin('favorites') !== null && plugin('favorites')._reloadProbe === undefined" 15 \
    || fail "the edited widget was not rebuilt"
assert_eq "$(ui_eval "plugin('cpu-load-monitor')._reloadProbe")" "42" \
    "a widget whose options did not change is kept, not rebuilt"

# Reordering moves the actors that already exist; it does not rebuild them.
ui_config_write '{"schema":1,"plugins":[
  {"id":"gnome-action","enabled":true},
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"favorites","enabled":true,"options":{"iconSize":18}}]}'
ui_wait_js "panel.get_children()[1]._panelPluginId === 'gnome-action'" 15 \
    || fail "reordering the config did not reorder the panel"
assert_true "panel.get_children().map(c => c._panelPluginId ?? 'ctlBtn').join(',') === 'ctlBtn,gnome-action,cpu-load-monitor,favorites'" \
    "the panel follows the configuration order"
assert_eq "$(ui_eval "plugin('cpu-load-monitor')._reloadProbe")" "42" \
    "reordering keeps the actors it moves"

# Broken JSON must not tear the panel down — and must keep the CURRENT widget
# set, not fall back to the defaults (the default set contains the clock, so a
# reappearing clock would betray a fallback-to-default).
ui_config_write '{"schema":1,"plugins":[{BROKEN'
sleep 2
assert_true "panel.mapped && plugin('favorites') !== null && plugin('clock') === null" \
    "broken config ignored, panel keeps current widgets"
