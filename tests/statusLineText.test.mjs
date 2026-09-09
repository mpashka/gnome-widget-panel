// Unit tests for the Claude status line the generated hook prints. The line is
// rendered from the hook's own stdin, never from what the panel answers, so a
// disabled or crashed widget cannot empty it; the panel contributes the delivery
// lamp, and a caption file contributes the place and the task. Run with
// `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FORMAT_STATUS_LINE_FN,
    formatClaudeStatusLine,
} from '../extension/plugins/ai-agent-usage/statusLineText.js';

const FULL_PAYLOAD = {
    model: {id: 'claude-opus-5', display_name: 'Opus 5', effort: 'high'},
    workspace: {current_dir: '/home/tester/Projects/home/ai_dispatcher'},
    cwd: '/home/tester',
    context_window: {used_percentage: 12.4, context_window_size: 200000},
    rate_limits: {
        five_hour: {used_percentage: 23.5, resets_at: 1738425600},
        seven_day: {used_percentage: 41.2, resets_at: 1738857600},
    },
};

test('renders model, place, task, context and both windows in that order', () => {
    assert.equal(
        formatClaudeStatusLine(FULL_PAYLOAD, {place: 'ai_dispatcher', task: 'ISS-9639'}),
        // 23.5% used is rounded before it is subtracted, so a window and its
        // remainder always add up to 100.
        'Opus 5 high · ai_dispatcher · ISS-9639 · ctx 12% · 5h 76% · 7d 59%'
    );
});

test('the context is what is spent, the windows are what is left', () => {
    const line = formatClaudeStatusLine({
        context_window: {used_percentage: 90},
        rate_limits: {five_hour: {used_percentage: 100}, seven_day: {used_percentage: 0}},
    });
    assert.equal(line, 'ctx 90% · 5h 0% · 7d 100%');
});

test('the dollars sit with the context: both are what this session spent', () => {
    assert.equal(
        formatClaudeStatusLine(FULL_PAYLOAD, {place: 'metrics', cost: 18.6878}),
        'Opus 5 high · metrics · ctx 12% · $18.69 · 5h 76% · 7d 59%'
    );
});

test('a session that has not spent anything shows no dollars', () => {
    const empty = {context_window: {used_percentage: 5}};
    assert.equal(formatClaudeStatusLine(empty, {cost: 0}), 'ctx 5%');
    assert.equal(formatClaudeStatusLine(empty, {}), 'ctx 5%');
    assert.equal(formatClaudeStatusLine(empty, {cost: 'дорого'}), 'ctx 5%');
});

test('a model name keeps its identity and drops its window variant', () => {
    assert.equal(
        formatClaudeStatusLine({model: {display_name: 'Opus 5 (1M context)', effort: 'high'}}),
        'Opus 5 high'
    );
});

test('without a caption the place is the directory name, not the path', () => {
    assert.equal(
        formatClaudeStatusLine({workspace: {current_dir: '/home/tester/Projects/home/configs'}}),
        'configs'
    );
    // `workspace.current_dir` wins over `cwd`, and a trailing slash is not a name.
    assert.equal(formatClaudeStatusLine({cwd: '/srv/build/'}), 'build');
});

test('the caption replaces the directory it was written for', () => {
    assert.equal(
        formatClaudeStatusLine(
            {workspace: {current_dir: '/home/tester/Projects/arcadia.3/infra/iss'}},
            {place: 'arcadia.3', task: 'ISS-9639'}
        ),
        'arcadia.3 · ISS-9639'
    );
    // Half a caption is still a caption: a session with no task keeps its place.
    assert.equal(
        formatClaudeStatusLine({cwd: '/home/tester/Projects/home/ai_dispatcher'},
                               {place: 'ai_dispatcher', task: ''}),
        'ai_dispatcher'
    );
});

test('missing segments are dropped, not reported as zero', () => {
    // The payload of a session that has not called the API yet: no rate limit
    // windows, no usage. "5h 0%" would read as an exhausted quota.
    assert.equal(formatClaudeStatusLine({model: {display_name: 'Opus 5'}}), 'Opus 5');
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
    const context = {place: 'ai_dispatcher', task: 'ISS-9639'};
    assert.equal(
        embedded(FULL_PAYLOAD, context),
        formatClaudeStatusLine(FULL_PAYLOAD, context)
    );
});
