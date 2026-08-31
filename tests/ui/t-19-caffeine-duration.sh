#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-caffeine
# Caffeine's timed keep-awake: the right-click menu offers durations, choosing
# one sets a deadline that the widget will end by itself, and turning it off
# clears both the deadline and its expiry timer. The D-Bus inhibitor itself is
# not exercised here — a headless session has no session manager to inhibit —
# so this pins down the widget's own bookkeeping.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

ui_start '{"schema":1,"plugins":[{"id":"caffeine","enabled":true,"options":{}}]}'

ui_wait_js "plugin('caffeine') !== null" || fail "caffeine did not appear"
W='plugin("caffeine")'

assert_true "$W._deadline === 0 && $W._expiryId === null" 'it starts with no deadline'

# A headless session has no org.gnome.SessionManager: the real Inhibit() fails
# asynchronously and (correctly) drops the deadline with it, since nothing is
# being kept awake. Stub the call out so the bookkeeping can be checked.
ui_eval "$W._inhibit = function () { this._cookie = 1; this._applyVisualState(true); }" >/dev/null
ui_eval "$W._uninhibit = function () { this._cookie = null; this._applyVisualState(false); }" >/dev/null

# --- a duration sets a deadline the widget will act on --------------------
ui_eval "$W._keepAwakeFor(900)" >/dev/null
assert_true "$W._deadline > 0 && $W._expiryId !== null" 'a duration arms the auto-off timer'
assert_true "$W._remainingSeconds() > 890 && $W._remainingSeconds() <= 900" 'the remaining time counts the chosen duration'

# --- the menu builds and reports the remaining time -----------------------
ui_eval "$W._openMenu()" >/dev/null
assert_true "$W._menu.numMenuItems >= 5" 'the right-click menu offers the durations'
ui_eval "$W._menu.close()" >/dev/null

# --- turning it off drops the deadline and its timer ----------------------
ui_eval "$W._turnOff()" >/dev/null
assert_true "$W._deadline === 0 && $W._expiryId === null" 'turning it off cancels the auto-off timer'
assert_eq "$(ui_eval "$W._tooltipText()")" '"Screen and suspend behave normally"' 'the tooltip reports the idle state'

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
