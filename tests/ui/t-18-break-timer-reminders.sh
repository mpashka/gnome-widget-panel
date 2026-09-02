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
# A headless session has no session manager: the async IsInhibited reply lands
# at an arbitrary moment and would silence the reminders mid-test.
ui_eval "plugin('break-timer')._refreshInhibited = () => {};
    plugin('break-timer')._inhibited = false; 'stubbed'" >/dev/null

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
  reminder:null, quietUntil:{}, pausedUntil:0, pausedFrom:0, dayStartedAt:0}'
ui_eval "plugin('break-timer')._canInterrupt = () => true" >/dev/null
ui_eval "plugin('break-timer')._refreshInhibited = () => {}" >/dev/null
ui_eval "$RESET_STATE" >/dev/null
ui_eval "plugin('break-timer')._inhibited = true" >/dev/null
ui_eval "$TICK(40)" >/dev/null
assert_true "$STATE.reminder === null" 'a kept-awake session is told nothing at all'
assert_true "!$UI._messageVisible && !$UI._screenVisible" 'neither stage shows while the screen is kept awake'
assert_true "$STATE.elapsed.micro >= 40" 'the counters keep running while silent'

# --- the manual pause, and the break owed the moment it ends --------------
# The pause also holds a session inhibitor (a paused timer must not be followed
# by a lock screen mid-meeting). A headless session has no session manager, so
# the shared SessionInhibitor's D-Bus calls are stubbed the same way t-19 does
# it, and the widget's own bookkeeping is what gets checked.
ui_eval "plugin('break-timer')._inhibited = false" >/dev/null
ui_eval "const i = plugin('break-timer')._pauseInhibitor;
  i.inhibit = function () { this._cookie = 1; this._notify(true); };
  i.release = function () { this._cookie = null; this._notify(false); }; 'stubbed'" >/dev/null
ui_eval "$RESET_STATE" >/dev/null
ui_eval "plugin('break-timer')._pause(900)" >/dev/null
assert_true "plugin('break-timer')._pauseInhibitor.held" \
    'pausing the reminders also keeps the screen awake'
assert_contains "$(ui_eval "plugin('break-timer')._statusFragment()")" 'screen kept awake' \
    'the tooltip says the screen is being kept awake'
ui_eval "$TICK(40)" >/dev/null
assert_true "$STATE.reminder === null" 'the pause keeps the reminders away'
assert_true "$STATE.elapsed.micro >= 40" 'a paused timer still counts the work'
ui_eval "plugin('break-timer')._resume()" >/dev/null
assert_true "$STATE.pausedUntil === 0" 'resume ends the pause'
assert_true "!plugin('break-timer')._pauseInhibitor.held" \
    'resuming gives the screen back'
assert_true "!plugin('break-timer')._inhibited" \
    'and stops reporting the just-released inhibitor, so the timers speak at once'
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"break"' 'the owed break arrives as soon as the pause ends'

# --- a pause that runs out hands the screen back on its own ---------------
ui_eval "$RESET_STATE" >/dev/null
ui_eval "plugin('break-timer')._pause(900)" >/dev/null
assert_true "plugin('break-timer')._pauseInhibitor.held" 'the pause holds the screen'
# Ticking does not move the wall clock, so the deadline is moved into the past
# instead — the same thing advance() sees when a pause simply runs out.
ui_eval "plugin('break-timer')._state.pausedUntil = 1; 'expired'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_true "$STATE.pausedUntil === 0" 'the pause ran out'
assert_true "!plugin('break-timer')._pauseInhibitor.held" \
    'an expired pause releases the keep-awake with it'

# --- the warning steps aside once, then stays put -------------------------
ui_eval "$RESET_STATE" >/dev/null
ui_eval "$TICK(25)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.stage")" '"prelude"' 'the warning is up again'
assert_eq "$(ui_eval "$UI._anchor")" '"top-right"' 'the warning starts on its anchor'
# Before it has stepped aside it is a hint about a break that has not begun:
# its Postpone/Skip would act on nothing one can see, and the pointer coming
# for them would move the message away first.
assert_true "$UI._messageActions.get_n_children() === 0" \
    'the warning carries no buttons until it has stepped aside'

ui_eval "$UI._onMessageEnter()" >/dev/null
assert_true "$UI._yielded" 'the pointer makes the warning yield'
YIELDED_ANCHOR="$(ui_eval "$UI._anchor")"
ui_eval "$UI._onMessageEnter()" >/dev/null
assert_eq "$(ui_eval "$UI._anchor")" "$YIELDED_ANCHOR" 'it yields once per showing, so its buttons stay clickable'
# ... and having moved, it offers them: they are now both meaningful and
# reachable. The row is built when the flight ends.
ui_wait_js "$UI._messageActions.get_n_children() > 0" 3 \
    || fail 'the warning never grew its buttons after stepping aside'
_ui_log 'ok - the buttons appear once the warning has stepped aside'

# --- and its buttons really do click, with a real pointer -----------------
# Not a formality: St.Button recognises its click with a ClutterClickGesture,
# which is cancelled if an ancestor consumes the same press. The message's own
# drag handler used to do exactly that, so neither Postpone nor Skip worked at
# all. Only a virtual-pointer press/release goes through that machinery — a
# direct `_actions.onSkip()` call, as used above, would pass either way.
#
# These gestures take real time, and the widget's own once-a-second tick would
# turn the warning into a break screen half way through one. Freeze it for the
# section and drive the clock entirely by hand.
ui_eval "const g = plugin('break-timer');
    globalThis._realTick = g._tick; g._tick = () => {}; 'frozen'" >/dev/null
HAND='(n => { const g = plugin("break-timer");
  for (let i = 0; i < n; i++) globalThis._realTick.call(g); })'

arm_warning() {   # a warning on screen, pinned where it is
    ui_eval "$RESET_STATE" >/dev/null
    ui_eval "$HAND(26)" >/dev/null
    # Pin it as though it had already stepped aside: the pointer arriving would
    # otherwise make it yield mid-approach, and a warning that has not yielded
    # carries no buttons to click.
    ui_eval "$UI._yielded = true; $UI._syncMessageActions(); 'pinned'" >/dev/null
    ui_wait_js "$UI._messageVisible && $STATE.reminder.stage === 'prelude'" 3 \
        || fail 'the warning did not come up for the pointer'
    ui_park_pointer
}

ui_eval "globalThis._skips = 0; globalThis._postpones = 0;
    const a = $UI._actions, s = a.onSkip, p = a.onPostpone;
    a.onSkip = () => { globalThis._skips++; return s && s(); };
    a.onPostpone = () => { globalThis._postpones++; return p && p(); }; 'wired'" >/dev/null

arm_warning
ui_click "$UI._messageActions.get_children().find(c => c.label.startsWith('Postpone'))" >/dev/null
# The gesture emits `clicked` while the release is still being dispatched.
ui_wait_js "globalThis._postpones === 1" 3 || true
assert_true "globalThis._postpones === 1" 'Postpone on the warning answers a real click'

arm_warning
ui_click "$UI._messageActions.get_children().find(c => c.label === 'Skip')" >/dev/null
ui_wait_js "globalThis._skips === 1" 3 || true
assert_true "globalThis._skips === 1" 'and so does Skip'

# --- the body still drags, and dragging is not a click --------------------
ui_eval "globalThis._skips = 0; globalThis._postpones = 0; 'r'" >/dev/null
arm_warning
ui_eval "$UI._dragged = false; $UI._dragOffset = null; 'r'" >/dev/null
ui_drag "$UI._message" 10 8 150 60 >/dev/null
ui_wait_js "$UI._dragged" 3 || true
assert_true "$UI._dragged" 'the warning can be dragged out of the way by its body'
assert_true "globalThis._skips === 0 && globalThis._postpones === 0" \
    'and a drag fires none of its actions'

# --- the break screen's own buttons click too -----------------------------
ui_eval "$RESET_STATE; globalThis._skips = 0; 'r'" >/dev/null
ui_eval "$HAND(31)" >/dev/null
ui_wait_js "$UI._screenVisible" 3 || fail 'the break screen did not come up'
ui_park_pointer
ui_click "$UI._screenActions.get_children().find(c => c.label === 'Skip')" >/dev/null
ui_wait_js "globalThis._skips === 1" 3 || true
assert_true "globalThis._skips === 1" 'Skip on the break screen answers a real click'

ui_eval "plugin('break-timer')._tick = globalThis._realTick; 'thawed'" >/dev/null

# --- the context menu builds, with the configured pause lengths -----------
ui_eval "plugin('break-timer')._openMenu()" >/dev/null
assert_true "plugin('break-timer')._menu.numMenuItems > 0" 'the right-click menu offers actions'
MENU_LABELS="$(ui_eval "plugin('break-timer')._menu.box.get_children()
    .map(i => i.label && i.label.text).filter(t => t)")"
_ui_log "pause menu: $MENU_LABELS"
assert_contains "$MENU_LABELS" 'Pause for 30 min' 'the default pause lengths are 30 min,'
assert_contains "$MENU_LABELS" 'Pause for 1:00' 'one hour,'
assert_contains "$MENU_LABELS" 'Pause for 1:30' 'and an hour and a half'
ui_eval "plugin('break-timer')._menu.close()" >/dev/null

# The lengths come from the configuration, written the same way everywhere.
ui_eval "plugin('break-timer')._pauseMinutes = [15, 45, 120]; 'set'" >/dev/null
ui_eval "plugin('break-timer')._openMenu()" >/dev/null
assert_contains "$(ui_eval "plugin('break-timer')._menu.box.get_children()
    .map(i => i.label && i.label.text).filter(t => t)")" 'Pause for 2:00' \
    'a configured pause length reaches the menu'
ui_eval "plugin('break-timer')._menu.close()" >/dev/null

# --- the end of the working day -------------------------------------------
# The deadline is wall-clock, so it is stubbed rather than waited for: the
# widget computes it from the local time zone (see _dayEndAt), and the rules it
# feeds are covered by the unit tests.
ui_eval "$RESET_STATE" >/dev/null
ui_eval "plugin('break-timer')._timers[2].enabled = true;
  plugin('break-timer')._timers[2].reminder = 'notify'; 'daily on'" >/dev/null
ui_eval "plugin('break-timer')._dayEnd = {enabled: true, minutes: 21 * 60 + 30};
  plugin('break-timer')._dayEndAt = () => Math.floor(Date.now() / 1000) + 3600;
  'deadline in an hour'" >/dev/null
ui_eval "$TICK(2)" >/dev/null
assert_true "$STATE.reminder === null" 'an hour before the deadline nothing is said'
assert_contains "$(ui_eval "plugin('break-timer')._dayEndFragment()")" 'until 21:30' \
    'the tooltip counts the working day down'

ui_eval "plugin('break-timer')._dayEndAt = () => Math.floor(Date.now() / 1000) - 1;
  'deadline passed'" >/dev/null
ui_eval "$TICK(1)" >/dev/null
assert_eq "$(ui_eval "$STATE.reminder.reason")" '"day-end"' \
    'the passed deadline raises the daily reminder'
assert_true "plugin('break-timer')._isOverdue(plugin('break-timer')._timers[2])" \
    'and the daily bar is full, though the counter is at seconds'
assert_contains "$(ui_eval "plugin('break-timer')._dayEndFragment()")" 'day over' \
    'the tooltip says the day is over'

ui_eval "plugin('break-timer')._dayEnd = {enabled: false, minutes: 0};
  plugin('break-timer')._dayEndAt = () => 0; 'off'" >/dev/null
ui_eval "$RESET_STATE" >/dev/null
ui_eval "$TICK(2)" >/dev/null
assert_true "$STATE.reminder === null" 'switched off, the clock says nothing'
assert_eq "$(ui_eval "plugin('break-timer')._dayEndFragment()")" '""' \
    'and its tooltip line disappears'

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
