#!/usr/bin/env bash
# @tag:ui-testing
# @tag:widget-ai-agent-status
# Regression for the ai-agent-status state model: several parallel Claude
# sessions collapse into ONE dot showing the most-urgent state, priority
# waiting > idle > thinking, with the tooltip carrying the per-session detail.
# Drives the widget's own event handler (`_applyEvent`) — the same path the
# Claude hooks feed — so no live agent traffic is needed.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"ai-agent-status","enabled":true,"options":{"secret":"t14","port":17895}},
  {"id":"clock","enabled":true}]}'

ui_wait_js "plugin('ai-agent-status') != null" 10 \
    || fail "ai-agent-status did not load"

# No sessions yet: exactly one (placeholder) dot, tooltip says so.
assert_true "plugin('ai-agent-status')._dots.length === 1" \
    "one placeholder dot with no sessions"
assert_true "plugin('ai-agent-status')._sortedSessions().length === 0" \
    "no sessions tracked initially"
assert_contains "$(ui_eval "plugin('ai-agent-status')._tooltipMarkup()")" \
    "no sessions" "tooltip reports no sessions"

# One session generating -> thinking.
ui_eval "plugin('ai-agent-status')._applyEvent('UserPromptSubmit','s1','/home/u/proj-a'); true" >/dev/null
assert_true "plugin('ai-agent-status')._sortedSessions()[0].state === 'thinking'" \
    "UserPromptSubmit -> thinking"
assert_true "plugin('ai-agent-status')._dots.length === 1" \
    "still one aggregated dot with one session"

# Add a finished session (idle) and a permission request (waiting). The merged
# dot must show the highest priority: waiting.
ui_eval "plugin('ai-agent-status')._applyEvent('Stop','s2','/home/u/proj-b'); true" >/dev/null
ui_eval "plugin('ai-agent-status')._applyEvent('Notification','s3','/home/u/proj-c'); true" >/dev/null
assert_true "plugin('ai-agent-status')._sortedSessions().length === 3" \
    "three sessions tracked"
assert_true "plugin('ai-agent-status')._dots.length === 1" \
    "three sessions still collapse into one dot"
assert_true "plugin('ai-agent-status')._sortedSessions()[0].state === 'waiting'" \
    "merged dot shows waiting (highest priority)"

# The waiting session ends -> next-highest is idle (idle > thinking).
ui_eval "plugin('ai-agent-status')._applyEvent('SessionEnd','s3'); true" >/dev/null
assert_true "plugin('ai-agent-status')._sortedSessions()[0].state === 'idle'" \
    "after waiting ends, idle outranks thinking"

# Statusline activity must NOT demote a waiting session.
ui_eval "plugin('ai-agent-status')._applyEvent('Notification','s1','/home/u/proj-a'); true" >/dev/null
ui_eval "plugin('ai-agent-status')._applyEvent('statusline-activity','s1','/home/u/proj-a'); true" >/dev/null
assert_true "plugin('ai-agent-status')._sessions.get('s1').state === 'waiting'" \
    "statusline activity does not demote waiting"

# All sessions end -> back to the placeholder dot.
ui_eval "for (const id of ['s1','s2']) plugin('ai-agent-status')._applyEvent('SessionEnd', id); true" >/dev/null
assert_true "plugin('ai-agent-status')._sortedSessions().length === 0" \
    "all sessions removed on SessionEnd"
assert_true "plugin('ai-agent-status')._dots.length === 1" \
    "placeholder dot returns when empty"
_ui_log "ok - agent-status merges sessions into one prioritised dot"
