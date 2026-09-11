#!/usr/bin/env bash
# @tag:ui-testing @tag:ai-collector
# The AI collector switch: collection is the panel's, not a widget's.
#
# Reported symptom: the ai-agent-status widget said "no sessions", which was
# indistinguishable from "nothing is collecting" — and there was no way to ask
# for collection without also putting a widget on the panel. So: the collector
# runs with no AI widget configured at all, the `ai-collector` setting turns it
# on and off live, and a widget with the collector off says exactly that instead
# of drawing the same empty picture a quiet hour draws.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

# Deliberately no AI widget in the panel.
ui_start '{"schema":1,"plugins":[{"id":"clock","enabled":true}]}'

C='panel.aiCollector'
restore_collector() { ui_set ai-collector true; }
trap 'code=$?; restore_collector; (exit $code); _ui_teardown' EXIT INT TERM

ui_wait_js "$C != null" 15 || fail "the panel exposes no AI collector"
assert_true "$C.running === true" \
    "the collector runs with no AI widget configured"
_ui_log "ok - collection does not need a widget on the panel"

# --- the switch ------------------------------------------------------------
ui_set ai-collector false
ui_wait_js "$C.running === false" 10 \
    || fail "turning the setting off did not stop the collector"
assert_true "$C._server === null" \
    "the localhost server is released when collection stops"
_ui_log "ok - the setting stops collection live"

ui_set ai-collector true
ui_wait_js "$C.running === true" 10 \
    || fail "turning the setting back on did not restart the collector"
_ui_log "ok - and starts it again"

# --- what the widgets say --------------------------------------------------
ui_config_write '{"schema":1,"plugins":[
  {"id":"ai-agent-status","enabled":true},
  {"id":"ai-agent-usage","enabled":true},
  {"id":"clock","enabled":true}]}'
ui_wait_js "plugin('ai-agent-status') !== null && plugin('ai-agent-usage') !== null" 15 \
    || fail "the AI widgets did not load"

# Collector on, nothing collected yet: "no sessions" is the honest answer.
assert_contains "$(ui_eval "plugin('ai-agent-status')._tooltipMarkup()")" \
    "no sessions" "with the collector on, an empty widget reports no sessions"

ui_set ai-collector false
ui_wait_js "$C.running === false" 10 || fail "the collector did not stop"
# The widgets are told, rather than polling: the collector notifies its
# listeners when the setting changes.
ui_wait_js "plugin('ai-agent-status')._tooltipMarkup().includes('AI collector is off')" 10 \
    || fail "the status widget did not say the collector is off"
assert_contains "$(ui_eval "plugin('ai-agent-usage')._tooltipMarkup()")" \
    "AI collector is off" "the usage widget says the collector is off"
_ui_log "ok - both widgets distinguish 'nothing happening' from 'nothing collecting'"

restore_collector
ui_wait_js "plugin('ai-agent-status')._tooltipMarkup().includes('no sessions')" 10 \
    || fail "the status widget did not recover when collection resumed"
_ui_log "ok - and they recover when it is switched back on"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
