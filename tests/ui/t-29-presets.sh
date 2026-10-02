#!/usr/bin/env bash
# @tag:ui-testing @tag:presets
# Presets from the drag handle's menu: the list appears only once a preset
# exists, switching restores each slot's widgets and snap position in one go,
# and an edit made while a preset is active comes back with that preset.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

CTL_BTN="find(panel, x => x.name === 'ctlBtn')"
PRESET_ITEM="(text => ($CTL_BTN)._presetSection._getMenuItems().find(i => i.side?.text === text))"
open_menu() {
    ui_eval "($CTL_BTN).menu.open(false); true" >/dev/null
    ui_wait_js "($CTL_BTN).menu.isOpen" || fail "the handle menu did not open"
}
close_menu() { ui_eval "($CTL_BTN).menu.close(false); true" >/dev/null; }
choose() {
    open_menu
    ui_eval "$PRESET_ITEM('$1').emit('activate', null); true" >/dev/null
    close_menu
}

ui_config_write '{"schema":1,"plugins":[{"id":"clock","enabled":true}]}'
ui_set aligned 5
ui_wait_js "plugin('clock') !== null" || fail "clock did not load"

open_menu
assert_true "($CTL_BTN)._presetSection.isEmpty()" "no preset rows before the first preset"
close_menu

PRESETS="$(python3 -c '
import json
cpu = json.dumps({"schema": 1, "plugins": [{"id": "cpu-load-monitor", "enabled": True}]})
office = {"widgets": cpu, "aligned": 9, "orientation": "horizontal",
          "content-padding": 0, "main-panel": "visible"}
raw = json.dumps({"schema": 1, "active": "", "noPreset": None,
                  "presets": [{"id": "p1", "name": "Office", "snapshot": office}]})
print(chr(39) + raw.replace(chr(92), chr(92) * 2).replace(chr(39), chr(92) + chr(39)) + chr(39))
')"
ui_set presets "$PRESETS"

open_menu
assert_true "$PRESET_ITEM('No preset') !== undefined && $PRESET_ITEM('Office') !== undefined" \
    "the menu lists the unnamed slot and the preset"
assert_true "$PRESET_ITEM('No preset')._ornament !== $PRESET_ITEM('Office')._ornament" \
    "the active slot is marked differently"
close_menu

choose Office
ui_wait_js "plugin('cpu-load-monitor') !== null && plugin('clock') === null" \
    || fail "switching to Office did not apply its widgets"
assert_eq "$(ui_get aligned)" "9" "Office applies its snap position"
_ui_log "ok - a preset applies its widgets and position"

# Written through the panel's own settings object, the one the switch used:
# a switch must not leave it holding later edits back.
ui_eval "panel._sets.set_int('aligned', 10); true" >/dev/null
assert_eq "$(ui_get aligned)" "10" "an edit after a switch is stored at once"
choose 'No preset'
ui_wait_js "plugin('clock') !== null && plugin('cpu-load-monitor') === null" \
    || fail "No preset did not restore the settings it had"
assert_eq "$(ui_get aligned)" "5" "No preset restores its snap position"
_ui_log "ok - No preset restores the settings it had"

choose Office
ui_wait_js "plugin('cpu-load-monitor') !== null && panel._sets.get_int('aligned') === 10" \
    || fail "the edit made in Office did not come back with it"
_ui_log "ok - edits land in the active preset"
