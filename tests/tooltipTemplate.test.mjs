// Unit tests for the gi-free tooltip template renderer.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {renderTemplate} from '../extension/tooltipTemplate.js';

test('substitutes tokens with fragment markup verbatim', () => {
    assert.equal(
        renderTemplate('{a}-{b}', {a: '<b>X</b>', b: 'Y'}),
        '<b>X</b>-Y'
    );
});

test('escapes literal template text but not fragments', () => {
    assert.equal(
        renderTemplate('a & b {t}', {t: '<i>&amp;</i>'}),
        'a &amp; b <i>&amp;</i>'
    );
});

test('escapes < and > in literal text', () => {
    assert.equal(renderTemplate('1 < 2 > 0', {}), '1 &lt; 2 &gt; 0');
});

test('unknown token renders as empty string', () => {
    assert.equal(renderTemplate('x{missing}y', {}), 'xy');
});

test('a present-but-empty fragment renders as empty', () => {
    assert.equal(renderTemplate('[{x}]', {x: ''}), '[]');
});

test('literal backslash-n becomes a real newline', () => {
    assert.equal(renderTemplate('a\\nb', {}), 'a\nb');
});

test('an existing real newline is preserved', () => {
    assert.equal(renderTemplate('a\nb', {}), 'a\nb');
});

test('adjacent tokens concatenate', () => {
    assert.equal(renderTemplate('{a}{b}', {a: '1', b: '2'}), '12');
});

test('cpu default template reassembles fragments and glue', () => {
    assert.equal(
        renderTemplate('cpu: {load}, {temp}\n°C: {legend}', {
            load: '42%',
            temp: '<span foreground="#ffc729">71°C</span>',
            legend: '<span>50..65</span>',
        }),
        'cpu: 42%, <span foreground="#ffc729">71°C</span>\n°C: <span>50..65</span>'
    );
});
