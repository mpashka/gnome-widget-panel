#!/usr/bin/env bash
# @tag:ui-testing
# Regression: `content-padding` applies live as inline padding on the panel.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

ui_set content-padding 12
ui_wait_js 'String(panel.style).includes("padding: 12px")' \
    || fail "padding: 12px did not appear in panel style (style: $(ui_eval 'String(panel.style)'))"
_ui_log "ok - content-padding=12 applies"

before_w="$(ui_eval 'panel.width')"
ui_set content-padding 0
ui_wait_js '!String(panel.style).includes("padding")' \
    || fail "padding did not clear from panel style"
ui_wait_js "panel.width < $before_w" \
    || fail "panel did not shrink after clearing the padding"
_ui_log "ok - content-padding=0 clears and the panel shrinks"
