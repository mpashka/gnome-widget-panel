// Unit tests for the gi-free colour and numeric helpers shared by the graph
// widgets. Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {hexToRgb, nowSeconds, toNumber} from '../extension/colorUtils.js';

test('hexToRgb converts a valid #rrggbb hex colour', () => {
    assert.deepEqual(hexToRgb('#ff8000'), [1, 128 / 255, 0]);
});

test('hexToRgb tolerates an invalid input by zeroing bad channels', () => {
    assert.deepEqual(hexToRgb('zzzzzz'), [0, 0, 0]);
});

test('toNumber returns a number as-is', () => {
    assert.equal(toNumber(42, 0), 42);
});

test('toNumber parses a numeric string', () => {
    assert.equal(toNumber('42', 0), 42);
});

test('toNumber returns the fallback for an invalid value', () => {
    assert.equal(toNumber('not-a-number', 7), 7);
});

test('nowSeconds returns an integer', () => {
    const value = nowSeconds();
    assert.equal(Number.isInteger(value), true);
});
