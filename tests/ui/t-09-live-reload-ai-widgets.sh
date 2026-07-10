#!/usr/bin/env bash
# @tag:ui-testing
# Regression for the live-reload port-bind race: after editing the config while
# an ai-agent-usage widget is present, the rebuilt instance must still hold a
# listening Soup.Server (previously the new instance failed to bind the port
# the old one still held, leaving the Claude hook endpoint dead).
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"ai-agent-usage","enabled":true,"options":{"claudeSecret":"t9","claudePort":17893}},
  {"id":"clock","enabled":true}]}'

# The widget binds its Soup.Server in the constructor; confirm it is up.
ui_wait_js "plugin('ai-agent-usage')?._server != null" 10 \
    || fail "ai-agent-usage server not up initially"
_ui_log "ok - server up after first load"

# Edit the config (add a widget) -> full rebuild -> the AI widget is recreated.
ui_config_write '{"schema":1,"plugins":[
  {"id":"ai-agent-usage","enabled":true,"options":{"claudeSecret":"t9","claudePort":17893}},
  {"id":"clock","enabled":true},
  {"id":"cpu-load-monitor","enabled":true}]}'
ui_wait_js "plugin('cpu-load-monitor') !== null" 15 || fail "reload did not add cpu widget"

# The recreated ai-agent-usage must still have a bound server (the race fix).
ui_wait_js "plugin('ai-agent-usage')?._server != null" 10 \
    || fail "ai-agent-usage lost its Soup.Server after a live config reload (port-bind race)"
_ui_log "ok - server still bound after live reload"
