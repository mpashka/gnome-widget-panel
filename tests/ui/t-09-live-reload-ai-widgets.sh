#!/usr/bin/env bash
# @tag:ui-testing @tag:ai-collector
# The AI collector belongs to the panel, not to a widget: it keeps its localhost
# server bound across a widget config reload, and keeps running after every AI
# widget has been removed from the panel.
#
# This started as a regression test for a port-bind race — the rebuilt
# ai-agent-usage instance failed to bind the port its predecessor still held, so
# a live config edit left the Claude endpoint dead. That race is gone by
# construction now that the widgets do not own the server; what is worth pinning
# instead is the property that replaced it.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"ai-agent-usage","enabled":true},
  {"id":"clock","enabled":true}]}'

C='panel.aiCollector'

ui_wait_js "$C != null && $C.running === true" 15 \
    || fail "the collector did not start"
_ui_log "ok - the collector runs"

# Edit the config (add a widget) -> the widgets reload.
ui_config_write '{"schema":1,"plugins":[
  {"id":"ai-agent-usage","enabled":true},
  {"id":"clock","enabled":true},
  {"id":"cpu-load-monitor","enabled":true}]}'
ui_wait_js "plugin('cpu-load-monitor') !== null" 15 || fail "reload did not add cpu widget"
assert_true "$C.running === true" \
    "the collector is untouched by a widget reload"
_ui_log "ok - a widget reload does not disturb collection"

# Remove every AI widget: collection must continue. This is the whole point of
# the split — the user asked for a collector that widgets do not switch off.
ui_config_write '{"schema":1,"plugins":[
  {"id":"clock","enabled":true},
  {"id":"cpu-load-monitor","enabled":true}]}'
ui_wait_js "plugin('ai-agent-usage') === null" 15 || fail "the AI widget was not removed"
assert_true "$C.running === true" \
    "removing every AI widget does not stop the collector"
_ui_log "ok - the collector outlives the widgets that view it"

# And the data it holds survives too: a widget added back sees what was
# collected while it was gone.
ui_eval "$C._applyEvent('UserPromptSubmit','t09','/home/u/proj'); true" >/dev/null
ui_config_write '{"schema":1,"plugins":[
  {"id":"ai-agent-status","enabled":true},
  {"id":"clock","enabled":true}]}'
ui_wait_js "plugin('ai-agent-status') !== null" 15 || fail "the status widget did not come back"
assert_true "plugin('ai-agent-status')._openSessions().length === 1" \
    "a widget added back sees what was collected while it was gone"
_ui_log "ok - collected state survives a widget being removed and re-added"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
