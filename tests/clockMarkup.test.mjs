// Unit tests for the gi-free clock markup helpers. The clock's format template
// accepts a small HTML-like subset (Pango markup) for bold/italic/colour; these
// helpers decide whether a formatted time is markup at all and how to salvage it
// when Pango rejects it. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {hasMarkup, stripMarkup} from '../extension/plugins/clock/clockMarkup.js';

test('a plain formatted time is not markup', () => {
    assert.equal(hasMarkup('12:34'), false);
    assert.equal(hasMarkup('Mon 05 May 12:34:56'), false);
});

test('literal < or & in a template is not treated as markup', () => {
    // Otherwise a template like "12 < 13" would take the markup path and fail
    // to parse, costing the user their clock over a legitimate character.
    assert.equal(hasMarkup('12 & 34'), false);
    assert.equal(hasMarkup('a < b'), false);
});

test('the supported styling tags are recognised', () => {
    assert.equal(hasMarkup('<b>12:34</b>'), true);
    assert.equal(hasMarkup('<i>12:34</i>'), true);
    assert.equal(hasMarkup('<u>12</u>:<small>34</small>'), true);
    assert.equal(hasMarkup('<span foreground="#ff8800">12:34</span>'), true);
});

test('an unsupported tag is not mistaken for styling', () => {
    assert.equal(hasMarkup('<script>x</script>'), false);
    assert.equal(hasMarkup('<div>12:34</div>'), false);
});

test('stripMarkup keeps the text and drops the supported tags', () => {
    assert.equal(stripMarkup('<b>12:34</b>'), '12:34');
    assert.equal(
        stripMarkup('<span foreground="#ff8800">12</span>:<small>34</small>'),
        '12:34'
    );
});

test('stripMarkup salvages the time from unbalanced markup', () => {
    // This is the fallback path: Pango refuses the string, and the user must
    // still see the time rather than an empty widget.
    assert.equal(stripMarkup('<b>12:34'), '12:34');
    assert.equal(stripMarkup('<span foreground="oops>12:34</span>'), '12:34');
});

test('stripMarkup leaves text without tags untouched', () => {
    assert.equal(stripMarkup('12:34'), '12:34');
    assert.equal(stripMarkup('12 & 34'), '12 & 34');
});
