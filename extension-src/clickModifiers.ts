// @tag:ui
// gi-free helper for the control-button click gestures (see controlButton.ts).
//
// A Clutter BUTTON_RELEASE carries the FULL modifier state in
// `event.get_state()` — not just Shift/Ctrl, but lock modifiers (NumLock =
// MOD2_MASK 0x10, CapsLock = LOCK_MASK 0x2), pressed-button masks (BUTTON1..3),
// Alt/Super, etc. The click handlers switch on that value expecting `0` for a
// plain click and `SHIFT_MASK`/`CONTROL_MASK` for the modified shortcuts, so any
// stray bit made every case miss and the gesture did nothing — e.g. with NumLock
// on, a right-click released with `state=0x10` fell through to `default` and the
// context menu never opened (issue #3). It only worked under the headless test,
// whose virtual pointer releases with `state=0`.
//
// Keep only the modifiers the gestures actually mean. The bit values match
// Clutter.ModifierType (ABI-stable): SHIFT_MASK=1, CONTROL_MASK=4.
export const CLICK_SHIFT = 1;
export const CLICK_CONTROL = 4;

// Strip everything except Shift/Ctrl from a raw event modifier state, so a plain
// click reads as 0 regardless of NumLock/CapsLock/button masks.
export function clickModifiers(state: number): number {
    return Number(state) & (CLICK_SHIFT | CLICK_CONTROL);
}
