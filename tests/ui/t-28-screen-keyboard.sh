#!/usr/bin/env bash
# @tag:ui-testing @tag:widget-screen-keyboard
# The screen keyboard types into the application in focus without taking the
# focus from it: clicking its keys puts Serbian letters into a GTK entry, Shift
# gives one capital, the script key switches Cyrillic/Latin on the same keys,
# and Backspace/Enter reach the entry as keys.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

ui_start '{"schema":1,"plugins":[{"id":"screen-keyboard","enabled":true,"options":{}}]}'

ui_wait_js "plugin('screen-keyboard') !== null" || fail "screen-keyboard did not appear"
W='plugin("screen-keyboard")'
KB="$W._keyboard"
key() { printf '%s._letterKeys.find(k => k.key.label === "%s").key' "$KB" "$1"; }
iconKey() { printf '%s.get_children().flatMap(r => r.get_children()).find(k => k.child?.icon_name === "%s")' "$KB" "$1"; }

OUT="$GWP_UI_TMP/entry.txt"
CLIENT="$GWP_UI_ROOT/tests/ui/text-entry-client.js"
# Spawned from INSIDE the shell so it connects to the test compositor (see
# t-20-app-windows.sh); cairo keeps GTK off GL.
ui_eval "GLib.spawn_command_line_async(
    \"sh -c 'GDK_BACKEND=wayland GSK_RENDERER=cairo exec gjs -m $CLIENT $OUT'\"
)" >/dev/null
trap 'pkill -f "gjs -m .*text-entry-client.js" 2>/dev/null || true' EXIT
ui_wait_js "global.display.focus_window?.title === 'Text entry'" 30 \
    || fail "the text entry window never took focus"
ui_wait_js "Main.inputMethod.currentFocus !== null" 10 \
    || fail "the entry never became the input method's focus"

# --- the button opens the keyboard; keys keep the window focused ----------
ui_click "$W"
ui_wait_js "$W.keyboardVisible" || fail "clicking the button did not open the keyboard"
assert_eq "$(ui_eval "$KB.script")" '"cyrillic"' 'it opens in Cyrillic by default'

ui_click "$(key љ)"
ui_click "$(key у)"
ui_click "$(key б)"
ui_wait_js "GLib.file_get_contents('$OUT')[0] && new TextDecoder().decode(GLib.file_get_contents('$OUT')[1]) === 'љуб'" \
    || fail "Cyrillic letters did not reach the entry (got: $(cat "$OUT" 2>/dev/null))"
_ui_log "ok - Cyrillic letters reach the focused entry"
assert_true "global.display.focus_window?.title === 'Text entry'" 'the application kept the focus'

# --- Shift is one capital ---------------------------------------------------
ui_click "$(iconKey osk-shift-symbolic)"
assert_true "$KB._letterKeys.some(k => k.key.label === 'Ж')" 'Shift shows capitals'
ui_click "$(key Ж)"
assert_true "$KB._letterKeys.some(k => k.key.label === 'ж')" 'Shift falls back after one letter'

# --- the script key switches to Latin on the same keys ----------------------
ui_click "$KB._switchKey"
assert_eq "$(ui_eval "$KB.script")" '"latin"' 'the script key switches to Latin'
assert_eq "$(ui_eval "$KB._switchKey.label")" '"Ћир"' 'the script key now offers Cyrillic'
ui_click "$(key č)"
ui_click "$(key đ)"
ui_wait_js "new TextDecoder().decode(GLib.file_get_contents('$OUT')[1]) === 'љубЖčđ'" \
    || fail "Latin letters did not reach the entry (got: $(cat "$OUT" 2>/dev/null))"
_ui_log "ok - a capital and Latin letters reach the entry"

# --- Backspace and Enter arrive as keys ------------------------------------
ui_click "$(iconKey osk-delete-symbolic)"
ui_wait_js "new TextDecoder().decode(GLib.file_get_contents('$OUT')[1]) === 'љубЖč'" \
    || fail "Backspace did not delete (got: $(cat "$OUT" 2>/dev/null))"
ui_click "$(iconKey osk-enter-symbolic)"
for _ in $(seq 20); do [[ -f "$OUT.activated" ]] && break; sleep 0.25; done
[[ -f "$OUT.activated" ]] || fail "Enter did not activate the entry"
_ui_log "ok - Backspace and Enter reach the entry"

# --- dragged by its edge, and the place is kept ------------------------------
before="$(ui_eval "$KB.get_position()")"
ui_drag "$KB" 3 3 -60 -40
assert_true "$KB.dragged" 'a press between the keys drags the keyboard'
assert_true "JSON.stringify($KB.get_position()) !== '$before'" 'the keyboard moved'
moved="$(ui_eval "JSON.stringify($KB.get_position())")"
assert_true "global.display.focus_window?.title === 'Text entry'" 'dragging kept the application focused'

# --- hiding keeps the chosen script and the place ---------------------------
ui_click "$(iconKey osk-hide-symbolic)"
ui_wait_js "!$W.keyboardVisible" || fail "the hide key did not close the keyboard"
ui_click "$W"
ui_wait_js "$W.keyboardVisible" || fail "the keyboard did not reopen"
assert_eq "$(ui_eval "$KB.script")" '"latin"' 'reopening keeps the script chosen last'
assert_eq "$(ui_eval "JSON.stringify($KB.get_position())")" "$moved" 'reopening keeps the dragged place'

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
