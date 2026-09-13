#!/usr/bin/env bash
# @tag:ui-testing @tag:ai-collector
# A screen lock must not stop the AI collector.
#
# Reported symptom: a red lamp at the end of Claude's status line after every
# unlock. Without an `unlock-dialog` session mode the shell disabled the whole
# extension on lock, the collector went with the panel and deregistered its
# endpoint, and every status line redrawn behind the lock reported delivery as
# broken. So: across a lock the collector is the same object and keeps
# listening, while nothing of the panel exists on the lock screen.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"

ui_start

cleanup_lock() {
    ui_eval "if (Main.sessionMode.currentMode === 'unlock-dialog') Main.sessionMode.popMode('unlock-dialog'); delete global._gwpLockCollector; 'ok'" >/dev/null 2>&1
}
trap 'code=$?; cleanup_lock; (exit $code); _ui_teardown' EXIT INT TERM

# The default port is usually held by the user's own shell.
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
ui_set ai-collector-port "$port"
ui_wait_js "panel.aiCollector !== null && panel.aiCollector.running && panel.aiCollector._port === $port && panel.aiCollector._server !== null" 15 \
    || fail "the collector is not listening before the lock"
ui_eval "global._gwpLockCollector = panel.aiCollector; 'saved'" >/dev/null

ui_eval "Main.sessionMode.pushMode('unlock-dialog'); 'locked'" >/dev/null
ui_wait_js "panel === null" 10 \
    || fail "the panel is still on the stage while the screen is locked"
_ui_log "ok - no panel on the lock screen"

assert_true "Main.extensionManager.lookup('$GWP_UUID').state === 1" \
    "the extension stays enabled while locked"
assert_true "global._gwpLockCollector.running === true && global._gwpLockCollector._server !== null" \
    "the collector keeps listening while locked"
_ui_log "ok - the collector survives the lock"

ui_eval "Main.sessionMode.popMode('unlock-dialog'); 'unlocked'" >/dev/null
ui_wait_js "panel !== null && panel.mapped" 15 \
    || fail "the panel did not come back after unlock"
assert_true "panel.aiCollector === global._gwpLockCollector" \
    "the rebuilt panel views the same collector"
_ui_log "ok - the panel returns on unlock with the same collector"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
