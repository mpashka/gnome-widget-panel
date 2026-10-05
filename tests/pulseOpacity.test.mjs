// Unit tests for the gi-free attention-pulse opacity curve.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {pulseOpacity} from '../extension/plugins/ai-agent-status/pulse.js';

test('starts at full brightness and reaches the dim end mid-cycle', () => {
    assert.equal(pulseOpacity(0, 6, 120), 255);
    assert.equal(pulseOpacity(6, 6, 120), 120);
});

test('comes back to full brightness at the end of the cycle', () => {
    assert.equal(pulseOpacity(12, 6, 120), 255);
});

test('is symmetric around the dim end', () => {
    for (let step = 1; step < 6; step++)
        assert.equal(pulseOpacity(step, 6, 120), pulseOpacity(12 - step, 6, 120));
});

test('moves monotonically from full to dim', () => {
    let previous = 256;
    for (let step = 0; step <= 6; step++) {
        const opacity = pulseOpacity(step, 6, 120);
        assert.ok(opacity < previous, `step ${step}: ${opacity} < ${previous}`);
        previous = opacity;
    }
});

test('a step counter that only increments keeps cycling', () => {
    assert.equal(pulseOpacity(24, 6, 120), pulseOpacity(0, 6, 120));
    assert.equal(pulseOpacity(31, 6, 120), pulseOpacity(7, 6, 120));
});

test('one step per half-cycle is a hard blink', () => {
    assert.equal(pulseOpacity(0, 1, 120), 255);
    assert.equal(pulseOpacity(1, 1, 120), 120);
    assert.equal(pulseOpacity(2, 1, 120), 255);
});

test('halfSteps below one is treated as one', () => {
    assert.equal(pulseOpacity(1, 0, 120), 120);
});

test('stays inside the opacity range for any step', () => {
    for (let step = -20; step < 40; step++) {
        const opacity = pulseOpacity(step, 6, 120);
        assert.ok(opacity >= 120 && opacity <= 255, `step ${step}: ${opacity}`);
    }
});
