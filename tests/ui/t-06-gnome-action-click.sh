#!/usr/bin/env bash
# @tag:ui-testing
# Regression: clicking the Gnome Action widget with a real (virtual) pointer
# opens the overview; the whole input path (reactive actor, St.Button, click
# handler, Main.overview) is exercised end-to-end.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

assert_true '!Main.overview.visible' "overview starts hidden"

ui_click "plugin('gnome-action')" >/dev/null
ui_wait_js 'Main.overview.visible' || fail "overview did not open after pointer click"
_ui_log "ok - pointer click on gnome-action opens the overview"

ui_eval 'Main.overview.hide(); "x"' >/dev/null
ui_wait_js '!Main.overview.visible' || fail "overview did not hide"
_ui_log "ok - overview hides again"
