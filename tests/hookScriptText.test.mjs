// @tag:widget-ai-agent-usage
//
// The generated hooks land in a user's ~/.claude and are run by Claude Code, not
// by us: a script that is subtly wrong is only noticed as an empty status line
// after a shell restart. These tests read the text the panel would write.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    eventHookScriptText,
    hookScriptText,
} from '../extension/plugins/ai-agent-usage/hookScriptText.js';

const PATHS = {
    registry: '/home/tester/.claude/gnome-widget-panel-ports.json',
    captions: '/home/tester/.claude/statusline',
    schemaDir: '/home/tester/.local/share/gnome-shell/extensions/x/schemas',
    schemaId: 'org.gnome.shell.extensions.floating-mini-panel',
    collectorKey: 'ai-collector',
};

// gjs runs the file directly, and `import` statements need module mode.
test('both hooks ask for gjs module mode', () => {
    for (const text of [hookScriptText(PATHS), hookScriptText(PATHS, {segment: true}),
        eventHookScriptText(PATHS.registry)])
        assert.ok(text.startsWith('#!/usr/bin/env -S gjs -m\n'), text.slice(0, 40));
});

test('owning the slot renders the whole line', () => {
    const text = hookScriptText(PATHS);
    assert.match(text, /function formatClaudeStatusLine/);
    assert.match(text, /function readCaption/);
    assert.match(text, /print\(formatClaudeStatusLine\(/);
});

// A segment prints only what the panel itself knows. Printing the model or the
// percentages here would duplicate the segment that owns that data.
test('as a segment it prints the lamp and nothing else', () => {
    const text = hookScriptText(PATHS, {segment: true});
    assert.doesNotMatch(text, /formatClaudeStatusLine/);
    assert.doesNotMatch(text, /readCaption/);
    assert.match(text, /if \(expected && !delivered\)\n {4}print\('🔴'\);/);
    assert.equal(text.match(/\bprint\(/g).length, 1);
});

// Delivery is the half the panel actually needs, and it must not depend on who
// owns the line.
test('both shapes deliver the payload to every endpoint', () => {
    for (const text of [hookScriptText(PATHS), hookScriptText(PATHS, {segment: true})]) {
        assert.match(text, /\/claude-statusline/);
        assert.match(text, /function collectorExpected/);
        assert.ok(text.includes(JSON.stringify(PATHS.registry)));
    }
});

// Claude interprets a Stop hook's stdout, so this one must stay mute.
test('the event hook prints nothing at all', () => {
    const text = eventHookScriptText(PATHS.registry);
    assert.doesNotMatch(text, /\bprint\(/);
    assert.match(text, /\/agent-event/);
});
