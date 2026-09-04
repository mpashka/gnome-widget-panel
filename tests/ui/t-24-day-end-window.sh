#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-break-timer
# The end-of-day window (#45): unlike every other reminder it does not expire,
# it cannot be closed, and it is answered only by choosing a time. It keeps the
# stage-1 contract — no keyboard focus, no buttons until it has stepped aside
# from the pointer — and it stays away while the screen is not the user's own.
# Ticks are driven by hand with a faked idle reading, so the run is
# deterministic and needs no input.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

# Only the daily timer, its own counter far from the limit: the clock alone
# raises this window.
ui_start '{"schema":1,"plugins":[{"id":"break-timer","enabled":true,
  "options":{"dayEndEnabled":true,"timers":[
    {"name":"micro","enabled":false},
    {"name":"rest","enabled":false},
    {"name":"daily","enabled":true,"workMinutes":480,"reminder":"notify"}]}}]}'

ui_wait_js "plugin('break-timer') !== null" || fail "break-timer did not appear"
ui_eval "plugin('break-timer')._readIdleMs = () => 0" >/dev/null
# A headless session has no session manager: the async IsInhibited reply lands
# at an arbitrary moment and would silence the reminders mid-test.
ui_eval "plugin('break-timer')._refreshInhibited = () => {};
    plugin('break-timer')._inhibited = false; 'stubbed'" >/dev/null

TICK='(n => { const g = plugin("break-timer"); for (let i = 0; i < n; i++) g._tick(); })'
STATE='plugin("break-timer")._state'
UI='plugin("break-timer")._reminderUi'

# --- before the deadline there is nothing ---------------------------------
ui_eval "plugin('break-timer')._dayEndAt = () => Math.floor(Date.now() / 1000) + 3600;
    'later'" >/dev/null
ui_eval "$TICK(5)" >/dev/null
assert_true "$STATE.reminder === null" 'nothing is said before the day ends'

# --- the deadline raises the window ---------------------------------------
ui_eval "plugin('break-timer')._dayEndAt = () => Math.floor(Date.now() / 1000) - 1;
    'over'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.reason")" '"day-end"' 'the clock raises the end-of-day window'
assert_eq "$(ui_eval "$UI._messageLabel.text")" '"The working day is over — stop for today"' 'it says what it is'
assert_true "$UI._messageVisible" 'the window is on screen'
assert_true "global.stage.get_key_focus() === null" 'it takes no key focus'
assert_true "$UI._grab === null" 'it grabs no input: the user must be able to close their work'

# --- it does not expire the way a break message does -----------------------
ui_eval "$TICK(120)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.reason")" '"day-end"' 'it is still there long past DUE_MESSAGE_SECONDS'
assert_true "$UI._messageVisible" 'and still on screen'

# --- no buttons until it has stepped aside once ----------------------------
assert_true "!$UI._messageActions.visible" 'the first showing carries no buttons'
ui_eval "$UI._onMessageEnter(); 'yielded'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_true "$UI._messageActions.visible" 'after it steps aside, the answer appears'
assert_eq "$(ui_eval "$UI._messageActions.get_children().length")" '1' 'one split button, not three'

# --- and it stays answerable for the rest of the evening -------------------
assert_true "$UI._yielded === true" 'it remembers that it has yielded'
ui_eval "$UI._onMessageLeave(); 'left'" >/dev/null
assert_true "$UI._yieldArmed === true" 'the pointer leaving re-arms the step-aside'
ui_eval "$UI._onMessageEnter(); 'yielded again'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_true "$UI._messageActions.visible" 'moving again does not take the answer away'

# --- today's numbers are on it --------------------------------------------
assert_true "$UI._detailsBox.visible" 'it shows what the day cost'
assert_true "$UI._detailsBox.get_children().length >= 2" 'keyboard time and the day start at least'
assert_true "$UI._messageIcon.visible" 'and its icon'

# --- answering it: only a time makes it go ---------------------------------
ui_eval "$UI._actions.onDayEndPostpone(600)" >/dev/null
assert_true "$STATE.reminder === null" 'answering puts it away'
assert_true "$STATE.dayEndSnoozedUntil > 0" 'and records until when'
ui_eval "$TICK(5)" >/dev/null
assert_true "$STATE.reminder === null" 'it stays away for the time it was given'

# --- ...and it comes back when that time is up -----------------------------
ui_eval "$STATE.dayEndSnoozedUntil = Math.floor(Date.now() / 1000) - 1; 'expired'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.reason")" '"day-end"' 'it returns when the postponement runs out'

# --- it never appears where it could not be answered -----------------------
ui_eval "plugin('break-timer')._canInterrupt = () => false; 'busy'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_true "$STATE.reminder === null" 'a shared or fullscreen screen holds it back'
assert_true "!$UI._messageVisible" 'and takes it off the screen'
assert_true "$STATE.dayEndSnoozedUntil <= Math.floor(Date.now() / 1000)" 'without counting as an answer'
ui_eval "plugin('break-timer')._canInterrupt = () => true; 'free'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.reason")" '"day-end"' 'it comes back once the screen is the user own again'

# --- the menu builds, and nothing in it closes the window without a time ---
# A fresh showing starts without buttons again, by the same rule as the first.
assert_true "!$UI._messageActions.visible" 'a returning window is buttonless until it moves again'
ui_eval "$UI._onMessageEnter(); 'yielded'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
ui_eval "$UI._openPostponeMenu($UI._messageActions.get_children()[0].get_children()[1]); 'opened'" >/dev/null
assert_true "$UI._postponeMenu !== null" 'the chevron opens the postpone menu'
assert_true "$UI._postponeMenu.numMenuItems >= 6" 'it offers the fixed lengths, the two steppers and preferences'
ui_eval "$UI._postponeMenu.close(); 'closed'" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.reason")" '"day-end"' 'closing the menu answers nothing'

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
