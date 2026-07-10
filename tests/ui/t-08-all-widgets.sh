#!/usr/bin/env bash
# @tag:ui-testing
# Regression: EVERY registered widget loads in one panel without JS errors.
# Catches a new widget whose create() throws or leaks at enable time.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"gnome-action","enabled":true},
  {"id":"gnome-menu","enabled":true},
  {"id":"favorites","enabled":true},
  {"id":"keyboard-layout","enabled":true},
  {"id":"app-notifications","enabled":true},
  {"id":"cpu-load-monitor","enabled":true},
  {"id":"ai-agent-usage","enabled":true,"options":{"claudeSecret":"t8","claudePort":17899}},
  {"id":"ai-agent-status","enabled":true,"options":{"secret":"t8s","port":17898}},
  {"id":"break-timer","enabled":true},
  {"id":"caffeine","enabled":true},
  {"id":"launch","enabled":true,"options":{"command":"true"}},
  {"id":"printscreen","enabled":true},
  {"id":"clock","enabled":true},
  {"id":"ubuntu-system-status","enabled":true}]}'

count="$(ui_eval 'panel.get_children().filter(c => c._panelPluginId).length')"
assert_eq "$count" "14" "all 14 configured widgets created"
assert_true 'panel.visible && panel.mapped' "panel alive with every widget"

if grep -q "JS ERROR" "$GWP_UI_TMP/shell.log"; then
    grep -m3 "JS ERROR" "$GWP_UI_TMP/shell.log" >&2
    fail "JS errors logged with all widgets enabled"
fi
_ui_log "ok - no JS errors with the full widget set"
