// @tag:widget-ai-agent-usage
//
// Gi-free normalization of Claude Code's two HTTP hook payloads into this
// widget's internal shapes: the `statusLine` command payload (token/context
// counters, sampled on a timer) and the `UserPromptSubmit` lifecycle event
// payload (the request markers drawn on the graph). Deliberately free of any
// `gi://` import so it is unit-testable in plain Node; see
// `../../../tests/claudeStatusLine.test.mjs`. Consumed by
// `aiAgentUsageGraph.ts`, which stays `@ts-nocheck` (dynamic GObject code) but
// imports these typed, validated boundary functions.

import {nowSeconds} from '../../colorUtils.js';
import type {AgentRequest} from '../../contracts.js';

/** One rate-limit window as Claude reports it under `rate_limits.<window>`. */
export interface ClaudeRateLimitWindow {
    used_percentage?: number;
    resets_at?: number;
}

/** Raw JSON Claude posts to the statusLine command hook (subset used here). */
export interface ClaudeStatusLinePayload {
    model?: {id?: string};
    context_window?: {
        used_percentage?: number;
        context_window_size?: number;
        // `null` before the first API call in a session, and again right
        // after `/compact` until the next API call repopulates it.
        current_usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        } | null;
    };
    rate_limits?: {
        five_hour?: ClaudeRateLimitWindow;
        seven_day?: ClaudeRateLimitWindow;
    };
}

/** One normalized rate-limit window, matching the Codex helper's shape. */
export interface ProviderRateLimit {
    used_percent: number | null;
    resets_at: number | null;
}

/**
 * Normalized Claude sample kept in `aiAgentUsageGraph.ts`'s per-provider map.
 * Shares field names with the Codex/Gemini helper output (`tokens.total`,
 * `context.window_tokens`, `limits.primary`/`limits.secondary`) so the
 * provider-agnostic sampling/drawing code (`parseTokens`, `parseContext`,
 * `parseLimit`, `bestLimit`) needs no per-provider branching.
 */
export interface ClaudeProviderSample {
    provider: 'claude';
    updated_at: string;
    updated_monotonic: number;
    model: string | null;
    tokens: {
        input: number;
        output: number;
        cache_creation: number;
        cache_read: number;
        // Full session tally (everything, incl. reused cache_read).
        total: number;
        // Consumption that drives the graph height: input + output +
        // cache_creation, i.e. `total` minus reused `cache_read`. cache_read is
        // tens of thousands of tokens even for a one-line reply and pinned every
        // column to full height (the "solid block" bug), so it is excluded here.
        load: number;
    };
    context: {
        used_percent: number;
        window_tokens: number;
    };
    limits?: {
        primary?: ProviderRateLimit;
        secondary?: ProviderRateLimit;
    };
}

function normalizeLimit(window?: ClaudeRateLimitWindow): ProviderRateLimit | null {
    const usedPercent = Number(window?.used_percentage);
    if (!window || !Number.isFinite(usedPercent))
        return null;
    const resetsAt = Number(window?.resets_at);
    return {
        used_percent: usedPercent,
        resets_at: Number.isFinite(resetsAt) ? resetsAt : null,
    };
}

// Claude's two rate-limit windows (`five_hour`, `seven_day`) map onto the
// `primary`/`secondary` slots `parseLimit`/`bestLimit` read in
// aiAgentUsageGraph.ts — the same primary-is-the-shorter-window convention the
// Codex helper uses — so the usage/rate-limit indicator bar and tooltip cup
// reflect real data for Claude instead of always falling back to zero.
export function normalizeClaudeStatusLine(data: ClaudeStatusLinePayload): ClaudeProviderSample {
    const context = data?.context_window ?? {};
    const usage = context.current_usage ?? {};
    const tokens = {
        input: Number(usage?.input_tokens ?? 0),
        output: Number(usage?.output_tokens ?? 0),
        cache_creation: Number(usage?.cache_creation_input_tokens ?? 0),
        cache_read: Number(usage?.cache_read_input_tokens ?? 0),
    };
    const total = Object.values(tokens)
        .filter(Number.isFinite)
        .reduce((sum, value) => sum + value, 0);
    const load = tokens.input + tokens.output + tokens.cache_creation;

    const primary = normalizeLimit(data?.rate_limits?.five_hour);
    const secondary = normalizeLimit(data?.rate_limits?.seven_day);
    const limits: ClaudeProviderSample['limits'] = {};
    if (primary)
        limits.primary = primary;
    if (secondary)
        limits.secondary = secondary;

    const sample: ClaudeProviderSample = {
        provider: 'claude',
        updated_at: new Date().toISOString(),
        updated_monotonic: nowSeconds(),
        model: data?.model?.id ?? null,
        tokens: {...tokens, total, load},
        context: {
            used_percent: Number(context.used_percentage ?? 0),
            window_tokens: Number(context.context_window_size ?? 0),
        },
    };
    if (Object.keys(limits).length)
        sample.limits = limits;
    return sample;
}

/** Raw JSON Claude posts to the `UserPromptSubmit` lifecycle event hook. */
export interface ClaudeUserPromptSubmitPayload {
    hook_event_name?: string;
    prompt?: string;
}

// Claude's statusLine payload carries no prompt text, so request markers
// (issue #6) come from the separate UserPromptSubmit lifecycle event hook
// instead (see claudeHook.ts's eventHookScript()); the widget uses its own
// receipt time as the timestamp since the payload has none and the event
// fires synchronously when the user submits the prompt. Returns null for any
// other event or an empty/missing prompt.
export function claudePromptRequest(payload: ClaudeUserPromptSubmitPayload): AgentRequest | null {
    if (payload?.hook_event_name !== 'UserPromptSubmit')
        return null;
    const text = String(payload?.prompt ?? '').replace(/\s+/g, ' ').trim();
    if (!text)
        return null;
    return {timestamp: new Date().toISOString(), text};
}
