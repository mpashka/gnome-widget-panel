// Unit tests for the gi-free verdict behind the version-status widget:
// is the running build the installed one, or is a relogin pending?
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {evaluateVersionState} from '../extension/plugins/version-status/versionState.js';

const LOADED_AT = 1_700_000_000_000;

test('a build older than the running modules is what is running', () => {
    const state = evaluateVersionState({
        loadedAt: LOADED_AT,
        stamp: {label: '0.2.3 (6308c4b)', builtAtMs: LOADED_AT - 60_000},
    });
    assert.equal(state.kind, 'current');
    assert.equal(state.text, '');
    assert.match(state.tooltip, /0\.2\.3 \(6308c4b\)/);
    // A warning with no warning to give takes no panel space (UX rule 15).
    assert.equal(state.visible, false);
});

test('a build stamped after module load means a relogin is pending', () => {
    const state = evaluateVersionState({
        loadedAt: LOADED_AT,
        stamp: {label: '0.2.4 (deadbee)', builtAtMs: LOADED_AT + 1},
        runningLabel: '0.2.3 (6308c4b)',
    });
    assert.equal(state.kind, 'stale');
    assert.equal(state.visible, true);
    assert.equal(state.text, 'relogin');
    assert.match(state.tooltip, /Installed: 0\.2\.4 \(deadbee\)/);
    assert.match(state.tooltip, /Running: 0\.2\.3 \(6308c4b\)/);
    assert.match(state.tooltip, /Log out and log back in/);
});

test('reports the load time when the running build was never read', () => {
    const state = evaluateVersionState({
        loadedAt: LOADED_AT,
        stamp: {label: '0.2.4 (deadbee)', builtAtMs: LOADED_AT + 1},
    });
    assert.equal(state.kind, 'stale');
    assert.match(state.tooltip, /Running: the build loaded at \d\d:\d\d:\d\d/);
});

test('no stamp on disk is reported as unknown, not as a warning', () => {
    const state = evaluateVersionState({loadedAt: LOADED_AT, stamp: null});
    assert.equal(state.kind, 'unknown');
    // Shown: a widget that cannot answer its own question is worth noticing.
    assert.equal(state.visible, true);
    assert.equal(state.text, '');
    assert.match(state.tooltip, /no build-stamp\.json/);
});

test('every state names an icon and a distinct kind', () => {
    const kinds = new Set();
    for (const stamp of [
        null,
        {label: 'a', builtAtMs: LOADED_AT - 1},
        {label: 'b', builtAtMs: LOADED_AT + 1},
    ]) {
        const state = evaluateVersionState({loadedAt: LOADED_AT, stamp});
        assert.match(state.icon, /-symbolic$/);
        kinds.add(state.kind);
    }
    assert.equal(kinds.size, 3);
});
