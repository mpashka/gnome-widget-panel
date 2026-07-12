// Regression for the empty-hook-body bug: Claude Code delivers a hook's JSON on
// a socketpair (fd 0 is a socket, not a pipe), so the generated hook must read
// fd 0 directly as a Unix input stream, NOT via GLib.file_get_contents(
// '/dev/stdin') (which reads a socket as empty and delivered no
// samples/markers/sessions). Run with npm test.
import test from 'node:test';
import assert from 'node:assert/strict';

import {READ_STDIN_FN} from '../extension/plugins/ai-agent-usage/hookStdin.js';

test('readStdin reads the inherited fd 0 as a Unix input stream', () => {
    assert.match(READ_STDIN_FN, /UnixInputStream|GioUnix\.InputStream/);
    assert.match(READ_STDIN_FN, /\{fd: 0/);
    assert.match(READ_STDIN_FN, /read_bytes/);
});

test('readStdin prefers the non-deprecated GioUnix.InputStream', () => {
    assert.match(READ_STDIN_FN, /gi:\/\/GioUnix/);
});

test('readStdin does not re-open /dev/stdin (unreadable for a socket)', () => {
    assert.doesNotMatch(READ_STDIN_FN, /file_get_contents\(['"]\/dev\/stdin/);
});
