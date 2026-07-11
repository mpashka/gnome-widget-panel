// Unit tests for the gi-free Claude statusLine/UserPromptSubmit normalization
// (issue #6: token graph empty and no request markers for Claude Code).
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    claudePromptRequest,
    normalizeClaudeStatusLine,
} from '../extension/plugins/ai-agent-usage/claudeStatusLine.js';

const FULL_PAYLOAD = {
    model: {id: 'claude-opus-4-8', display_name: 'Opus'},
    context_window: {
        used_percentage: 8,
        context_window_size: 200000,
        current_usage: {
            input_tokens: 8500,
            output_tokens: 1200,
            cache_creation_input_tokens: 5000,
            cache_read_input_tokens: 2000,
        },
    },
    rate_limits: {
        five_hour: {used_percentage: 23.5, resets_at: 1738425600},
        seven_day: {used_percentage: 41.2, resets_at: 1738857600},
    },
};

test('normalizeClaudeStatusLine sums current_usage into tokens.total', () => {
    const value = normalizeClaudeStatusLine(FULL_PAYLOAD);
    assert.equal(value.provider, 'claude');
    assert.equal(value.model, 'claude-opus-4-8');
    assert.deepEqual(value.tokens, {
        input: 8500,
        output: 1200,
        cache_creation: 5000,
        cache_read: 2000,
        total: 16700,
    });
    assert.deepEqual(value.context, {used_percent: 8, window_tokens: 200000});
});

test('normalizeClaudeStatusLine maps rate_limits onto limits.primary/secondary', () => {
    const value = normalizeClaudeStatusLine(FULL_PAYLOAD);
    assert.deepEqual(value.limits, {
        primary: {used_percent: 23.5, resets_at: 1738425600},
        secondary: {used_percent: 41.2, resets_at: 1738857600},
    });
});

test('normalizeClaudeStatusLine tolerates a null current_usage (before the first API call)', () => {
    const value = normalizeClaudeStatusLine({
        context_window: {used_percentage: 0, context_window_size: 200000, current_usage: null},
    });
    assert.deepEqual(value.tokens, {input: 0, output: 0, cache_creation: 0, cache_read: 0, total: 0});
});

test('normalizeClaudeStatusLine omits limits when rate_limits is absent', () => {
    const value = normalizeClaudeStatusLine({context_window: {current_usage: null}});
    assert.equal('limits' in value, false);
});

test('normalizeClaudeStatusLine skips a rate-limit window with no usable percentage', () => {
    const value = normalizeClaudeStatusLine({
        context_window: {current_usage: null},
        rate_limits: {five_hour: {}, seven_day: {used_percentage: 41.2, resets_at: 1738857600}},
    });
    assert.equal(value.limits.primary, undefined);
    assert.deepEqual(value.limits.secondary, {used_percent: 41.2, resets_at: 1738857600});
});

test('claudePromptRequest turns a UserPromptSubmit payload into an AgentRequest', () => {
    const request = claudePromptRequest({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Write a function to calculate the factorial of a number',
    });
    assert.equal(request.text, 'Write a function to calculate the factorial of a number');
    assert.equal(Number.isNaN(Date.parse(request.timestamp)), false);
});

test('claudePromptRequest collapses internal whitespace', () => {
    const request = claudePromptRequest({
        hook_event_name: 'UserPromptSubmit',
        prompt: '  fix   the\nbug  ',
    });
    assert.equal(request.text, 'fix the bug');
});

test('claudePromptRequest ignores non-UserPromptSubmit events', () => {
    assert.equal(claudePromptRequest({hook_event_name: 'Stop', prompt: 'irrelevant'}), null);
});

test('claudePromptRequest ignores an empty/missing prompt', () => {
    assert.equal(claudePromptRequest({hook_event_name: 'UserPromptSubmit', prompt: ''}), null);
    assert.equal(claudePromptRequest({hook_event_name: 'UserPromptSubmit'}), null);
    assert.equal(claudePromptRequest({hook_event_name: 'UserPromptSubmit', prompt: '   '}), null);
});
