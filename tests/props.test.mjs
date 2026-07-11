// Unit tests for the gi-free `definedProps` GObject-initializer helper.
// Regression for the cpu-load-monitor settings page failing to open because
// `colorButton` passed `tooltip_text: undefined` into a GObject initializer
// (GJS throws on undefined property values). Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {definedProps} from '../extension/props.js';

test('definedProps drops keys whose value is undefined', () => {
    assert.deepEqual(
        definedProps({dialog: 'd', valign: 3, tooltip_text: undefined}),
        {dialog: 'd', valign: 3}
    );
});

test('definedProps keeps a provided tooltip', () => {
    assert.deepEqual(
        definedProps({tooltip_text: 'Dot colour'}),
        {tooltip_text: 'Dot colour'}
    );
});

test('definedProps preserves falsy-but-defined values and null', () => {
    assert.deepEqual(
        definedProps({a: 0, b: '', c: false, d: null}),
        {a: 0, b: '', c: false, d: null}
    );
});
