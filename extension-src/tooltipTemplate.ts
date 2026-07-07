// @tag:ui
//
// Shared, reusable tooltip templating used by widgets that render a Pango-markup
// hover tooltip (see `plugins/cpu-load-monitor/cpuGraph.ts` and
// `plugins/ai-agent-usage/aiAgentUsageGraph.ts`). A widget builds a set of
// already-formatted Pango-markup `fragments` from live data and lets the user
// pick a `template` string; `renderTemplate` substitutes the fragments into the
// template. This module is deliberately free of any `gi://` import so it loads
// unchanged in both the GNOME Shell and the preferences process (the live
// preview in each widget's `prefs.ts` renders sample fragments through it).

/** Escape the three characters that are special to Pango markup. */
function escapePangoText(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escape literal (non-token) template text for Pango and turn a literal `\n`
 * escape sequence into a real newline. Real newlines already present in the
 * template are preserved verbatim.
 */
function renderLiteral(text: string): string {
    return escapePangoText(text).replace(/\\n/g, '\n');
}

/**
 * Render a tooltip `template` by substituting each `{token}` with the matching
 * entry from `fragments`.
 *
 * - `fragments` values are already-built Pango markup and are inserted verbatim.
 * - All literal (non-token) text between tokens is Pango-escaped (`& < >`).
 * - An unknown `{token}` (no matching key) renders as the empty string.
 * - A literal `\n` in the template becomes a real newline.
 *
 * The function knows nothing about any specific widget; callers own their token
 * names, default template and the fragment values.
 */
export function renderTemplate(
    template: string,
    fragments: Record<string, string>
): string {
    const tokenPattern = /\{([A-Za-z0-9_]+)\}/g;
    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenPattern.exec(template)) !== null) {
        result += renderLiteral(template.slice(lastIndex, match.index));
        const name = match[1];
        if (Object.prototype.hasOwnProperty.call(fragments, name))
            result += fragments[name];
        lastIndex = tokenPattern.lastIndex;
    }
    result += renderLiteral(template.slice(lastIndex));
    return result;
}
