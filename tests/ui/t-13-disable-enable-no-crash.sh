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

# Same path, but with a relocate pending: a resize schedules an idle source that
# calls _relocate() on the next tick. That source used to be untracked, so a
# disable landing in between ran it against a destroyed panel (EGO-L-004; the
# failure class behind this very issue). Force the schedule, then disable in the
# SAME tick so the source is still pending when the panel goes away.
ui_eval "panel._scheduleRelocate(); panel._relocateIdleId !== 0" >/dev/null \
    || fail "_scheduleRelocate did not arm an idle source"
ui_eval "panel._scheduleRelocate(); Main.extensionManager.disableExtension('$GWP_UUID'); 'disabled'" >/dev/null
ui_eval "Main.extensionManager.enableExtension('$GWP_UUID'); 'enabled'" >/dev/null
ui_wait_js "$CTL" \
    || fail "panel did not come back after disable with a relocate pending"
assert_true "panel._relocateIdleId === 0" \
    "the rebuilt panel starts with no pending relocate source"
_ui_log "ok - disabling with a relocate pending leaves no orphaned idle source"

# The specific crash this guards against.
if grep -q "super.destroy is not a function" "$GWP_UI_TMP/shell.log"; then
    fail "CtlActions.destroy() threw 'super.destroy is not a function' (issue #7 regression)"
fi
if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR during disable/enable (see shell.log)"
fi
_ui_log "ok - no JS errors during disable/enable"
