// @tag:widget-clock
//
// Gi-free helpers for the clock's markup-enabled time format. The clock draws
// its text with Pango, so the "small HTML subset" the format template accepts is
// Pango markup: <b>, <i>, <u>, <s>, <big>, <small>, <tt> and
// <span foreground="#rrggbb" ...>. Keeping the decision logic here (rather than
// inline in the GJS drawing code) makes it unit-testable — see
// tests/clockMarkup.test.mjs.

/** Tags of the supported subset, used to decide whether to parse markup at all. */
const MARKUP_TAG = /<\/?(?:b|i|u|s|big|small|tt|sub|sup|span)(?:\s[^<>]*)?\/?>/i;

/**
 * True when the formatted time looks like it carries markup and should be
 * handed to Pango's markup parser. Plain time strings (`12:34`) take the cheaper
 * literal path and can never fail to parse.
 */
export function hasMarkup(text) {
    return typeof text === 'string' && MARKUP_TAG.test(text);
}

/**
 * Strip the supported tags, leaving the text they wrap. Used to measure and draw
 * a template whose markup Pango rejected, so a typo costs the styling but never
 * the clock itself.
 */
export function stripMarkup(text) {
    return String(text ?? '').replace(
        /<\/?(?:b|i|u|s|big|small|tt|sub|sup|span)(?:\s[^<>]*)?\/?>/gi,
        ''
    );
}
