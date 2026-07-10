// Unit tests for the gi-free release-channel / version-label module.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {RELEASE_CHANNEL, formatVersionLabel} from '../extension/version.js';

test('RELEASE_CHANNEL is a string', () => {
    assert.equal(typeof RELEASE_CHANNEL, 'string');
});

test('appends the channel badge when set', () => {
    assert.equal(formatVersionLabel('0.1.0', 'alpha'), '0.1.0 (alpha)');
});

test('omits the badge for a stable (empty) channel', () => {
    assert.equal(formatVersionLabel('1.2.3', ''), '1.2.3');
});

test('defaults the channel to RELEASE_CHANNEL', () => {
    const expected = RELEASE_CHANNEL
        ? `2.0.0 (${RELEASE_CHANNEL})`
        : '2.0.0';
    assert.equal(formatVersionLabel('2.0.0'), expected);
});

test('falls back to "unknown" for an empty version', () => {
    assert.equal(formatVersionLabel('', ''), 'unknown');
});
