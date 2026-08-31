#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-break-timer
# The break reminders: a focus-free warning first, then the modal break screen,
# which resets the timer when it runs out. Postpone keeps the break owed, skip
# starts the interval over, and a break screen that must not interrupt degrades
# to the message. A session inhibitor or the manual pause silences both stages
# while the counters keep running, and the break is owed as soon as they end.
# Ticks are driven by hand with a faked idle reading, so the run is
# deterministic and needs no input.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

# micro: 30 s of work, 10 s break, 5 s warning. rest/daily off.
ui_start '{"schema":1,"plugins":[{"id":"break-timer","enabled":true,
  "options":{"timers":[
    {"name":"micro","enabled":true,"workMinutes":0.5,"breakSeconds":10,
     "reminder":"screen","leadSeconds":5,"allowPostpone":true,
     "postponeMinutes":1,"allowSkip":true},
    {"name":"rest","enabled":false},
    {"name":"daily","enabled":false}]}}]}'

ui_wait_js "plugin('break-timer') !== null" || fail "break-timer did not appear"
ui_eval "plugin('break-timer')._readIdleMs = () => 0" >/dev/null

# The widget's own tick would race these hand-driven ones.
TICK='(n => { const g = plugin("break-timer"); for (let i = 0; i < n; i++) g._tick(); })'
STATE='plugin("break-timer")._state'
UI='plugin("break-timer")._reminderUi'

# --- the warning comes first, without taking focus ------------------------
ui_eval "$TICK(25)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"prelude"' 'the warning arms one lead before the limit'
assert_eq "$(ui_eval "$UI._messageLabel.text")" '"Micro break in 5 s"' 'the warning counts down'
assert_true "$UI._messageVisible && $UI._grab === null" 'the warning grabs nothing'
assert_true "global.stage.get_key_focus() === null" 'the warning takes no key focus'

# --- then the break screen ------------------------------------------------
ui_eval "$TICK(5)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"break"' 'the warning becomes a break screen'
assert_true "$UI._screenVisible && $UI._grab !== null" 'the break screen takes input'
assert_true "!$UI._messageVisible" 'the warning steps aside for the screen'
assert_eq "$(ui_eval "$UI._screenTime.text")" '"0:10"' 'the break counts down'

# --- serving the break resets the timer -----------------------------------
ui_eval "$TICK(10)" >/dev/null
assert_true "$STATE.reminder === null && $STATE.elapsed.micro <= 1" 'a served break resets the timer'
assert_true "!$UI._screenVisible && $UI._grab === null" 'the break screen releases the grab'

# --- postpone keeps the break owed ----------------------------------------
ui_eval "$TICK(30)" >/dev/null
ui_eval "$UI._actions.onPostpone()" >/dev/null
assert_true "$STATE.reminder === null && $STATE.elapsed.micro >= 30" 'postpone leaves the counter full'
ui_eval "$TICK(59)" >/dev/null
assert_true "$STATE.reminder === null" 'postpone stays quiet for its minute'
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"break"' 'a postponed break comes back'

# --- skip starts the interval over ----------------------------------------
ui_eval "$UI._actions.onSkip()" >/dev/null
assert_true "$STATE.reminder === null && $STATE.elapsed.micro === 0" 'skip starts the interval over'

# --- no interruption allowed: the message alone ---------------------------
ui_eval "plugin('break-timer')._canInterrupt = () => false" >/dev/null
ui_eval "$TICK(30)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"due"' 'a suppressed break screen degrades to the message'
assert_true "!$UI._screenVisible && $UI._messageVisible" 'nothing dims while interrupting is unwelcome'

# --- something keeping the session awake silences both stages -------------
# The real IsInhibited() answer would arrive asynchronously and overwrite the
# faked one between ticks, so the refresh is stubbed out for this section.
RESET_STATE='plugin("break-timer")._state = {elapsed:{micro:0,rest:0,daily:0},
  reminder:null, quietUntil:{}, pausedUntil:0}'
ui_eval "plugin('break-timer')._canInterrupt = () => true" >/dev/null
ui_eval "plugin('break-timer')._refreshInhibited = () => {}" >/dev/null
ui_eval "$RESET_STATE" >/dev/null
ui_eval "plugin('break-timer')._inhibited = true" >/dev/null
ui_eval "$TICK(40)" >/dev/null
assert_true "$STATE.reminder === null" 'a kept-awake session is told nothing at all'
assert_true "!$UI._messageVisible && !$UI._screenVisible" 'neither stage shows while the screen is kept awake'
assert_true "$STATE.elapsed.micro >= 40" 'the counters keep running while silent'

# --- the manual pause, and the break owed the moment it ends --------------
ui_eval "plugin('break-timer')._inhibited = false" >/dev/null
ui_eval "$RESET_STATE" >/dev/null
ui_eval "plugin('break-timer')._pause(900)" >/dev/null
ui_eval "$TICK(40)" >/dev/null
assert_true "$STATE.reminder === null" 'the pause keeps the reminders away'
assert_true "$STATE.elapsed.micro >= 40" 'a paused timer still counts the work'
ui_eval "plugin('break-timer')._resume()" >/dev/null
assert_true "$STATE.pausedUntil === 0" 'resume ends the pause'
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"break"' 'the owed break arrives as soon as the pause ends'

# --- the warning steps aside once, then stays put -------------------------
ui_eval "$RESET_STATE" >/dev/null
ui_eval "$TICK(25)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"prelude"' 'the warning is up again'
assert_eq "$(ui_eval "$UI._anchor")" '"top-right"' 'the warning starts on its anchor'
ui_eval "$UI._onMessageEnter()" >/dev/null
assert_true "$UI._yielded" 'the pointer makes the warning yield'
YIELDED_ANCHOR="$(ui_eval "$UI._anchor")"
ui_eval "$UI._onMessageEnter()" >/dev/null
assert_eq "$(ui_eval "$UI._anchor")" "$YIELDED_ANCHOR" 'it yields once per showing, so its buttons stay clickable'

# --- the context menu builds ----------------------------------------------
ui_eval "plugin('break-timer')._openMenu()" >/dev/null
assert_true "plugin('break-timer')._menu.numMenuItems > 0" 'the right-click menu offers actions'
ui_eval "plugin('break-timer')._menu.close()" >/dev/null

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
