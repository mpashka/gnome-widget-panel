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
// The layout follows Codex's status line (model, where the work happens,
// context, both usage windows), because that is the line the user compares this
// one against — but every segment is cut to what a laptop screen fits: the model
// without its window variant, the place without the path leading to it, the
// percentages without the words around them.
//
// The place and the task are the one thing the payload cannot answer: it knows a
// directory, not what is being worked on there. They come from a caption file
// another program writes per session (see `claudeHook.ts`); nothing writes one —
// the line falls back to the directory's own name.

import type {ClaudeStatusLinePayload} from './claudeStatusLine.js';

/** What the hook knows and the payload does not. */
export interface StatusLineContext {
    /** Where the session works, in one word: the project or the checkout it lives in. */
    place?: string;
    /** What it works on: a ticket key, a task directory — whatever names the task. */
    task?: string;
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
    // The parenthetical of a display name is a variant of the same model
    // ("Opus 5 (1M context)"), and the context segment below already reports how
    // much of that window is gone — so the name keeps only its identity.
    const name = String(model.display_name ?? model.id ?? '').replace(/\s*\(.*/, '').trim();
    // Codex shows the reasoning effort next to the model; Claude reports one
    // only for some models, so it joins the name when present and is dropped
    // silently when not.
    const effort = String(model.effort ?? '').trim();
    if (name)
        parts.push(effort ? `${name} ${effort}` : name);

    // Where the session works and what it works on. The full path is not shown:
    // on a laptop screen it costs a third of the line to repeat a prefix every
    // session shares. Whoever knows about tasks names the place (`place`); with
    // nobody to ask, the last path component is still the project's own name.
    const directory = String(payload?.workspace?.current_dir ?? payload?.cwd ?? '').trim();
    const place = String(context.place ?? '').trim()
        || directory.replace(/\/+$/, '').split('/').pop() || '';
    if (place)
        parts.push(place);
    const task = String(context.task ?? '').trim();
    if (task)
        parts.push(task);

    // Deliberately the half that grows: `ctx` is what this session has spent,
    // the two windows below are what is left of a quota. Watching a number climb
    // towards a limit is the question asked of the context, and watching one
    // drain is the question asked of a quota.
    const used = percent(payload?.context_window?.used_percentage);
    if (used !== null)
        parts.push(`ctx ${used}%`);

    // Both windows are absent until the first API call of a session answers, and
    // an absent window is not a zero one — it is omitted rather than reported as
    // "0%", which would read as an exhausted quota.
    const fiveHour = remaining(payload?.rate_limits?.five_hour);
    if (fiveHour !== null)
        parts.push(`5h ${fiveHour}%`);
    const sevenDay = remaining(payload?.rate_limits?.seven_day);
    if (sevenDay !== null)
        parts.push(`7d ${sevenDay}%`);

    if (context.lamp)
        parts.push('🚨');
    return parts.join(' · ');
}


// The renderer's own source, embedded verbatim into the generated hook script
// (see `claudeHook.ts`'s `hookScript()`). TypeScript annotations are erased by
// the compiler, so what `toString()` returns at run time is the plain ES2023
// function declaration gjs parses. Same text, one place to fix.
export const FORMAT_STATUS_LINE_FN = formatClaudeStatusLine.toString();
