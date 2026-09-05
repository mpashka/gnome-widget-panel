// @tag:widget-ai-agent-usage
//
// The Claude Code status line itself: the text the generated hook prints back to
// Claude. Gi-free, so it is unit-tested in plain Node (see
// `../../../tests/statusLineText.test.mjs`).
//
// The status line is deliberately **independent of this extension**. It used to
// be the widget's HTTP answer, which meant a disabled or crashed widget left the
// user with an empty status line; now the hook renders it from its own stdin and
// the panel is only an optional consumer of the same payload. What the panel can
// still contribute is one bit — whether the payload reached it — drawn as the
// lamp at the end of the line.
//
// The layout follows Codex's status line (model, path, context, both usage
// windows), because that is the line the user compares this one against.

import type {ClaudeStatusLinePayload} from './claudeStatusLine.js';

/** What the hook knows and the payload does not. */
export interface StatusLineContext {
    /** `$HOME`, abbreviated to `~` in the shown path. */
    home?: string;
    /** An AI widget is enabled but the payload reached none of its endpoints. */
    lamp?: boolean;
}

// Self-contained on purpose: every helper lives inside the function body,
// because FORMAT_STATUS_LINE_FN below embeds this function's own source into the
// generated hook script, which has no module scope to import from. Keeping one
// text for both the tested and the shipped renderer is worth the nesting — the
// alternative, a hand-copied string constant, drifts from the function it
// mirrors on the first edit that forgets one of the two.
export function formatClaudeStatusLine(
    payload: ClaudeStatusLinePayload,
    context: StatusLineContext = {}
): string {
    const percent = (value: unknown): number | null => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number) : null;
    };
    const remaining = (window: unknown): number | null => {
        const used = percent((window as {used_percentage?: unknown})?.used_percentage);
        return used === null ? null : Math.min(100, Math.max(0, 100 - used));
    };

    const parts: string[] = [];

    const model = payload?.model ?? {};
    const name = String(model.display_name ?? model.id ?? '').trim();
    // Codex shows the reasoning effort next to the model; Claude reports one
    // only for some models, so it joins the name when present and is dropped
    // silently when not.
    const effort = String(model.effort ?? '').trim();
    if (name)
        parts.push(effort ? `${name} ${effort}` : name);

    const directory = String(payload?.workspace?.current_dir ?? payload?.cwd ?? '').trim();
    const home = String(context.home ?? '').replace(/\/+$/, '');
    if (directory) {
        parts.push(home && (directory === home || directory.startsWith(`${home}/`))
            ? `~${directory.slice(home.length)}`
            : directory);
    }

    const used = percent(payload?.context_window?.used_percentage);
    if (used !== null)
        parts.push(`Context ${used}% used`);

    // Both windows are absent until the first API call of a session answers, and
    // an absent window is not a zero one — it is omitted rather than reported as
    // "0% left", which would read as an exhausted quota.
    const fiveHour = remaining(payload?.rate_limits?.five_hour);
    if (fiveHour !== null)
        parts.push(`5h ${fiveHour}% left`);
    const sevenDay = remaining(payload?.rate_limits?.seven_day);
    if (sevenDay !== null)
        parts.push(`weekly ${sevenDay}% left`);

    if (context.lamp)
        parts.push('🔴');
    return parts.join(' · ');
}


// The renderer's own source, embedded verbatim into the generated hook script
// (see `claudeHook.ts`'s `hookScript()`). TypeScript annotations are erased by
// the compiler, so what `toString()` returns at run time is the plain ES2023
// function declaration gjs parses. Same text, one place to fix.
export const FORMAT_STATUS_LINE_FN = formatClaudeStatusLine.toString();
