// Regression for issue #3: a real control-button right-click did nothing in a
// GNOME session (worked only under the headless test). The click handlers
// switched on the raw `event.get_state()`, which on a real BUTTON_RELEASE
// carries lock modifiers (NumLock=0x10) / button masks, so `case 0` /
// `case SHIFT_MASK` never matched. clickModifiers() strips everything but
// Shift/Ctrl so a plain click reads as 0. Run with npm test.
import test from 'node:test';
import assert from 'node:assert/strict';

import {clickModifiers, CLICK_SHIFT, CLICK_CONTROL} from '../extension/clickModifiers.js';

test('a plain click with NumLock on (the #3 repro, state=0x10) reads as 0', () => {
    assert.equal(clickModifiers(0x10), 0);
});

test('button masks and other locks are stripped to 0', () => {
    assert.equal(clickModifiers(0x400), 0); // BUTTON3_MASK
    assert.equal(clickModifiers(0x210), 0); // BUTTON2_MASK | NumLock
    assert.equal(clickModifiers(0x2), 0);   // CapsLock (LOCK_MASK)
    assert.equal(clickModifiers(0), 0);
});

test('Shift/Ctrl survive, alone and mixed with lock modifiers', () => {
    assert.equal(clickModifiers(CLICK_SHIFT), CLICK_SHIFT);       // 0x1
    assert.equal(clickModifiers(CLICK_CONTROL), CLICK_CONTROL);   // 0x4
    assert.equal(clickModifiers(0x11), CLICK_SHIFT);              // NumLock|Shift -> Shift
    assert.equal(clickModifiers(0x14), CLICK_CONTROL);            // NumLock|Ctrl -> Ctrl
    assert.equal(clickModifiers(0x5), CLICK_SHIFT | CLICK_CONTROL); // Shift|Ctrl
});
