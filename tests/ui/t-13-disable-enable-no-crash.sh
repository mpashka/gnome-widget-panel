#!/usr/bin/env bash
# @tag:ui-testing
# Regression for issue #7: disabling and re-enabling the extension must not throw.
# `CtlActions` is a Clutter.Action (no destroy()), yet its destroy() called
# `super.destroy()` → "super.destroy is not a function". That threw out of
# ControlButton.destroy() → FloatingMiniPanel.destroy() → disable(), leaving the
# extension stuck in ERROR. On screen lock (the shell disables extensions without
# an `unlock-dialog` session-mode) this left a half-destroyed panel with no
# stylesheet — giant icons — that never came back on unlock. This exercises the
# same disable→enable path the lock/unlock cycle uses.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

CTL="panel && find(panel, x => x.name === 'ctlBtn')"
assert_true "$CTL" "control button present initially"

# Toggle the extension off and back on via the ExtensionManager — the same path
# the shell drives around screen lock/unlock. Disable and enable must land in
# SEPARATE main-loop turns: doing both in one eval tick makes the manager swallow
# the enable while the disable is still transitioning, leaving the extension
# DISABLED (a harness artefact, not the ERROR this test guards against). Two evals
# guarantee the disable settles before the enable.
ui_eval "Main.extensionManager.disableExtension('$GWP_UUID'); 'disabled'" >/dev/null
ui_eval "Main.extensionManager.enableExtension('$GWP_UUID'); 'enabled'" >/dev/null

ui_wait_js "$CTL" \
    || fail "control button did not come back after disable/enable (extension likely stuck in ERROR)"
_ui_log "ok - extension re-enabled and the panel returned"

# The specific crash this guards against.
if grep -q "super.destroy is not a function" "$GWP_UI_TMP/shell.log"; then
    fail "CtlActions.destroy() threw 'super.destroy is not a function' (issue #7 regression)"
fi
if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR during disable/enable (see shell.log)"
fi
_ui_log "ok - no JS errors during disable/enable"
