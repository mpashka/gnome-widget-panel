#!/usr/bin/env bash
# @tag:ui-testing @tag:cpu-cost @tag:widget-ai-agent-status @tag:widget-break-timer
# What the panel is allowed to do while nothing is happening (gwp-231).
#
# Two widgets used to burn CPU on work that changed nothing: the agent-status dot
# destroyed and recreated its actor on every 5 s tick and every collector
# notification, and its attention pulse ran an eased — therefore frame-rate —
# opacity animation for the whole life of the widget, pulsing or not. A pulsing
# dot measured ~3 % of a CPU core, six times the rest of the panel together.
# Numbers and the measuring stand: docs/testing/cpu-cost.md.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start '{"schema":1,"plugins":[
  {"id":"ai-agent-status","enabled":true},
  {"id":"break-timer","enabled":true}]}'

W="plugin('ai-agent-status')"

ui_wait_js "$W !== null && $W._dots.length === 1" 15 \
    || fail "the agent-status dot did not appear"
_ui_log "ok - the widget starts with one dot"

# --- the pulse timer exists only while a dot pulses ------------------------

assert_true "$W._dots[0]._pulses === false" \
    "nothing is promptable, so the dot does not pulse"
assert_true "!$W._pulseTimeoutId" \
    "and no pulse timer is running"

# Force the promptable picture the collector would produce, the way the widget
# itself does it, and the timer must come up with it.
ui_eval "$W._dots[0]._pulses = true; $W._syncPulseTimer(); 0" >/dev/null
assert_true "!!$W._pulseTimeoutId" \
    "a pulsing dot starts the pulse timer"
# The stepped pulse walks the opacity down from full; an eased one would leave
# opacity at 255 between its restarts.
ui_wait_js "$W._dots[0].opacity < 255" 5 \
    || fail "the pulse did not change the dot's opacity"
_ui_log "ok - the pulse steps the opacity"

ui_eval "$W._dots[0]._pulses = false; $W._syncPulseTimer(); 0" >/dev/null
assert_true "!$W._pulseTimeoutId" \
    "the timer is released when nothing pulses any more"
assert_eq "$(ui_eval "$W._dots[0].opacity")" 255 \
    "and the dot is left at full opacity"

# --- an unchanged state keeps its actor ------------------------------------

# _rebuildDots is what the tick and every collector update call. With the drawn
# state unchanged it must leave the actor alone: recreating it relaid out the
# whole panel to draw the identical dot.
DOT_BEFORE="$(ui_eval "$W._dots[0].toString()")"
ui_eval "$W._rebuildDots(); $W._rebuildDots(); $W._refresh(); 0" >/dev/null
assert_eq "$(ui_eval "$W._dots[0].toString()")" "$DOT_BEFORE" \
    "repeated refreshes keep the same dot actor"
assert_true "$W._dots.length === 1" \
    "and do not pile up dots"

# --- the break timer repaints only when the bars would differ --------------

B="plugin('break-timer')"
ui_wait_js "$B !== null && $B._paintedSignature !== null" 15 \
    || fail "the break-timer graph did not paint"
assert_true "$B._paintSignature() === $B._paintedSignature" \
    "right after a paint the tick has nothing to repaint"
_ui_log "ok - a second tick would not repaint the identical bars"

assert_contains "$(ui_eval "$B._paintSignature()")" "|" \
    "the signature carries the drawing box and the bars"

assert_true "!/error|exception/i.test(Main.extensionManager.lookup('gnome-widget-panel@mpashka.github.com')?.error ?? '')" \
    "no extension error"
_ui_log "PASS"
