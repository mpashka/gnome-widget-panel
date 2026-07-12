#!/usr/bin/env bash
# @tag:ui-testing
# Regression for the issue #3 follow-up: dragging the control button must start
# on the FIRST pointer movement, not after the click-vs-long-press timer.
# Raising LONGPRESS_MS to 400ms (to fix right-click) previously delayed
# drag-start, so the widget felt "glued" to its position until 400ms elapsed.
# The MOTION handler now enters drag mode on the first movement while the
# primary button is held; this test presses, moves the pointer only ~40ms later
# (far under 400ms) and asserts the button actually moved. See controlButton.ts.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
ui_start

CTL_BTN="find(panel, x => x.name === 'ctlBtn')"

# Press the primary button on the handle, then move the pointer well before the
# 400ms long-press threshold. A drag gated on the timer would not react yet
# (GLUED); the fixed motion-started drag moves the handle immediately (MOVED).
result=$(ui_eval "
    (async () => {
        const a = ($CTL_BTN);
        if (!a) throw new Error('ctlBtn not found');
        const [ax, ay] = a.get_transformed_position();
        const cx = ax + a.width / 2, cy = ay + a.height / 2;
        const seat = Clutter.get_default_backend().get_default_seat();
        globalThis._gwpVdev ??=
            seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const d = globalThis._gwpVdev;
        // Virtual-device events need a monotonic-microsecond timestamp
        // (global.get_current_time() is 0 in the headless test session, so
        // Mutter silently drops the injected gesture); see lib.sh ui_click_button.
        const t = () => GLib.get_monotonic_time();
        // Prime the pointer over the handle: the first absolute motion of a
        // session only applies X (Y clamps to 0), so send it twice and yield so
        // Mutter picks the actor under the pointer before the press.
        d.notify_absolute_motion(t(), cx, cy);
        await new Promise(res => setTimeout(res, 10));
        d.notify_absolute_motion(t(), cx, cy);
        await new Promise(res => setTimeout(res, 10));
        d.notify_button(t(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await new Promise(res => setTimeout(res, 40));   // << LONGPRESS_MS (400)
        d.notify_absolute_motion(t(), cx + 120, cy + 80);
        await new Promise(res => setTimeout(res, 30));
        const [bx, by] = a.get_transformed_position();
        d.notify_button(t(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        return (Math.abs(bx - ax) > 4 || Math.abs(by - ay) > 4) ? 'MOVED' : 'GLUED';
    })()
")

assert_contains "$result" "MOVED" \
    "drag starts on the first motion (not glued until LONGPRESS_MS)"
_ui_log "ok - dragging starts immediately on pointer movement"

# The panel must be back to a normal (visible, non-dragging) state afterwards.
ui_wait_js "panel.visible" \
    || fail "panel not visible after the drag gesture"
_ui_log "ok - panel visible after the drag"

if grep -q "JS ERROR.*gnome-widget-panel" "$GWP_UI_TMP/shell.log"; then
    fail "extension logged a JS ERROR (see shell.log)"
fi
_ui_log "ok - no extension JS errors in shell log"
