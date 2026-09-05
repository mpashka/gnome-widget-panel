// Unit tests for the Claude status line the generated hook prints. The line is
// rendered from the hook's own stdin, never from what the panel answers, so a
// disabled or crashed widget cannot empty it; the one thing the panel
// contributes is the delivery lamp. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FORMAT_STATUS_LINE_FN,
    formatClaudeStatusLine,
} from '../extension/plugins/ai-agent-usage/statusLineText.js';

const FULL_PAYLOAD = {
    model: {id: 'claude-opus-5', display_name: 'Opus 5', effort: 'high'},
    workspace: {current_dir: '/home/tester/Projects/home'},
    cwd: '/home/tester',
    context_window: {used_percentage: 12.4, context_window_size: 200000},
    rate_limits: {
        five_hour: {used_percentage: 23.5, resets_at: 1738425600},
        seven_day: {used_percentage: 41.2, resets_at: 1738857600},
    },
};

test('renders model, path, context and both windows in the Codex order', () => {
    assert.equal(
        formatClaudeStatusLine(FULL_PAYLOAD, {home: '/home/tester'}),
        // 23.5% used is rounded before it is subtracted, so a line that shows
        // both halves of a window always adds up to 100.
        'Opus 5 high · ~/Projects/home · Context 12% used · 5h 76% left · weekly 59% left'
    );
});

test('rate limits are reported as remaining, not as used', () => {
    const line = formatClaudeStatusLine({
        rate_limits: {five_hour: {used_percentage: 100}, seven_day: {used_percentage: 0}},
    });
    assert.equal(line, '5h 0% left · weekly 100% left');
});

test('workspace.current_dir wins over cwd, and only $HOME is abbreviated', () => {
    assert.equal(
        formatClaudeStatusLine({workspace: {current_dir: '/srv/build'}}, {home: '/home/tester'}),
        '/srv/build'
    );
    assert.equal(
        formatClaudeStatusLine({cwd: '/home/tester'}, {home: '/home/tester'}),
        '~'
    );
    // A directory that merely starts with the same characters is not inside it.
    assert.equal(
        formatClaudeStatusLine({cwd: '/home/tester2/x'}, {home: '/home/tester'}),
        '/home/tester2/x'
    );
});

test('missing segments are dropped, not reported as zero', () => {
    // The payload of a session that has not called the API yet: no rate limit
    // windows, no usage. "5h 0% left" would read as an exhausted quota.
    assert.equal(
        formatClaudeStatusLine({model: {display_name: 'Opus 5'}}, {home: '/home/tester'}),
        'Opus 5'
    );
    assert.equal(formatClaudeStatusLine({}), '');
});

test('the model falls back to its id, and effort is optional', () => {
    assert.equal(formatClaudeStatusLine({model: {id: 'claude-opus-5'}}), 'claude-opus-5');
});

test('the lamp is appended last, and only when asked', () => {
    assert.equal(
        formatClaudeStatusLine({model: {display_name: 'Opus 5'}}, {lamp: true}),
        'Opus 5 · 🔴'
    );
    assert.equal(formatClaudeStatusLine({}, {lamp: true}), '🔴');
    assert.equal(formatClaudeStatusLine({}, {lamp: false}), '');
});

test('the embedded source is the same function, callable on its own', () => {
    // The generated hook has no module scope: it pastes this source in and calls
    // it. If the renderer ever grows a module-level dependency, this breaks here
    // instead of silently emptying every status line on the next install.
    const embedded = new Function(`${FORMAT_STATUS_LINE_FN}\nreturn formatClaudeStatusLine;`)();
    assert.equal(
        embedded(FULL_PAYLOAD, {home: '/home/tester'}),
        formatClaudeStatusLine(FULL_PAYLOAD, {home: '/home/tester'})
    );
});
