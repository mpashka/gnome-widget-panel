// Unit tests for the build stamp `./gwp build` writes into the tree: parsing it
// (untrusted input) and turning it into the short identity the handle menu and
// the bug report show. Run with `npm test` (which builds first).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    formatBuildId,
    parseBuildStamp,
} from '../extension/buildStamp.js';

const BUILT_AT = 1_700_000_000_000;

test('parses a stamp written by ./gwp build', () => {
    const stamp = parseBuildStamp(JSON.stringify({
        label: '0.2.3 (6308c4b-dirty)',
        builtAt: '2026-09-05T12:00:00+0200',
        builtAtMs: BUILT_AT,
        commit: '6308c4b',
        dirty: true,
    }));
    assert.deepEqual(stamp, {
        label: '0.2.3 (6308c4b-dirty)',
        builtAtMs: BUILT_AT,
        builtAt: '2026-09-05T12:00:00+0200',
        commit: '6308c4b',
        dirty: true,
    });
});

test('a stamp from an older build carries no commit, and that is not an error', () => {
    const stamp = parseBuildStamp(JSON.stringify({
        label: '0.2.3 (6308c4b)',
        builtAtMs: BUILT_AT,
    }));
    assert.deepEqual(stamp, {label: '0.2.3 (6308c4b)', builtAtMs: BUILT_AT});
    assert.equal(formatBuildId(stamp), '');
});

test('a build made outside a checkout has an empty commit', () => {
    const stamp = parseBuildStamp(JSON.stringify({
        label: '0.2.3',
        builtAtMs: BUILT_AT,
        commit: '',
        dirty: false,
    }));
    assert.equal(formatBuildId(stamp), '');
});

test('rejects anything that is not a usable stamp', () => {
    assert.equal(parseBuildStamp('not json'), null);
    assert.equal(parseBuildStamp('null'), null);
    assert.equal(parseBuildStamp('[]'), null);
    assert.equal(parseBuildStamp(JSON.stringify({builtAtMs: 1})), null);
    assert.equal(parseBuildStamp(JSON.stringify({label: 'x'})), null);
    assert.equal(
        parseBuildStamp(JSON.stringify({label: 'x', builtAtMs: 'soon'})),
        null
    );
});

test('the build identity says whether the tree was dirty', () => {
    assert.equal(
        formatBuildId({label: 'x', builtAtMs: BUILT_AT, commit: '6308c4b'}),
        '6308c4b'
    );
    assert.equal(
        formatBuildId({
            label: 'x',
            builtAtMs: BUILT_AT,
            commit: '6308c4b',
            dirty: true,
        }),
        '6308c4b-dirty'
    );
    assert.equal(formatBuildId(null), '');
});
