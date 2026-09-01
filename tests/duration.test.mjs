// Unit tests for the gi-free duration helpers: how a duration is written in a
// settings page and how far one press of -/+ moves it.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    durationStep,
    formatClock,
    formatDuration,
    stepDuration,
} from '../extension/duration.js';

test('formatDuration counts down in M:SS, and H:MM:SS past an hour', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(75), '1:15');
    assert.equal(formatDuration(3600), '1:00:00');
    assert.equal(formatDuration(-5), '0:00');
});

test('formatClock writes a duration the way a settings page is read', () => {
    assert.equal(formatClock(30), '30 s');
    assert.equal(formatClock(60), '1 min');
    assert.equal(formatClock(45 * 60), '45 min');
    assert.equal(formatClock(90 * 60), '1:30');
    assert.equal(formatClock(8 * 3600), '8:00');
    // The reason this exists: nobody should read "480" and think eight hours.
    assert.notEqual(formatClock(480 * 60), '480');
});

test('the step follows the value', () => {
    assert.equal(durationStep(30), 5);
    assert.equal(durationStep(5 * 60), 60);
    assert.equal(durationStep(20 * 60), 5 * 60);
    assert.equal(durationStep(45 * 60), 10 * 60);
    assert.equal(durationStep(2 * 3600), 15 * 60);
    assert.equal(durationStep(8 * 3600), 30 * 60);
});

test('stepping snaps to a multiple of the current step', () => {
    // 47 min is not on the ladder; it tidies up instead of carrying its
    // remainder forever.
    assert.equal(stepDuration(47 * 60, 1, [0, 24 * 3600]), 50 * 60);
    assert.equal(stepDuration(47 * 60, -1, [0, 24 * 3600]), 40 * 60);
});

test('stepping down crosses a ladder boundary by the smaller step', () => {
    assert.equal(stepDuration(60, -1, [0, 3600]), 55);
    assert.equal(stepDuration(10 * 60, -1, [0, 3600]), 9 * 60);
    assert.equal(stepDuration(3600, -1, [0, 24 * 3600]), 50 * 60);
});

test('stepping up leaves the ladder the same way', () => {
    assert.equal(stepDuration(55, 1, [0, 3600]), 60);
    assert.equal(stepDuration(3600, 1, [0, 24 * 3600]), 75 * 60);
    assert.equal(stepDuration(3 * 3600, 1, [0, 24 * 3600]), 3 * 3600 + 15 * 60);
});

test('the range is enforced in both directions', () => {
    assert.equal(stepDuration(0, -1, [0, 3600]), 0);
    assert.equal(stepDuration(3600, 1, [0, 3600]), 3600);
    assert.equal(stepDuration(30, -1, [30, 3600]), 30);
});

// The ladder's whole point: the bigger the value, the bigger the press. A fixed
// step cannot serve a 30 s micro break and an 8 h daily limit at once.
test('a press moves the value by more the larger it is', () => {
    const move = (seconds) => stepDuration(seconds, 1, [0, 24 * 3600]) - seconds;
    assert.equal(move(30), 5);
    assert.equal(move(5 * 60), 60);
    assert.equal(move(8 * 3600), 30 * 60);
    // Walking the daily limit an hour up or down is two presses, not sixty.
    let value = 8 * 3600;
    value = stepDuration(value, 1, [0, 24 * 3600]);
    value = stepDuration(value, 1, [0, 24 * 3600]);
    assert.equal(formatClock(value), '9:00');
});
