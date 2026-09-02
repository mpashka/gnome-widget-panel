// @tag:widget-gnome-menu
//
// Pure search rules of the applications menu: how the searchable text of one
// application is built, and how a typed query is matched and ranked against it.
// An application is findable under every name it carries — the translated name
// shown in the menu ("Настройки"), the untranslated one from the `.desktop`
// file ("Settings"), its generic name, its keywords and its executable — so a
// query in either language finds it.
// Deliberately free of any `gi://` import so it is unit tested in plain Node
// (see ../../../tests/appSearch.test.mjs); `index.ts` reads the fields off
// `Gio.DesktopAppInfo` and calls in here for the matching.

/** An application as the search rules see it: a name to sort by and its terms. */
export interface SearchableApp {
    /** Name shown in the menu; the tie-breaker between equally ranked matches. */
    name: string;
    /** Normalized searchable strings, most significant (the name) first. */
    terms: string[];
}

/**
 * Most rows one search shows. The pane scrolls, but a query of one or two
 * letters can match hundreds of applications and every row is a real actor
 * built on each keystroke; beyond this many the list is noise anyway.
 */
export const MAX_SEARCH_RESULTS = 50;

// Everything that is not a letter or a digit separates words, in any script.
const WORD_SEPARATORS = /[^\p{L}\p{N}]+/u;

// Match quality of one query word against one term, best first. The term index
// is added on top (see `wordScore`), so a hit on the display name outranks the
// same hit on a keyword.
const SCORE_EXACT = 0;
const SCORE_PREFIX = 100;
const SCORE_WORD_PREFIX = 200;
const SCORE_SUBSTRING = 300;
const NO_MATCH = Number.POSITIVE_INFINITY;

/**
 * Fold a string into the form both queries and terms are compared in:
 * lower case, `ё` merged into `е` (nobody types it) and accents dropped, so
 * "Café" is found by "cafe" and "Ёжик" by "ежик".
 */
export function normalizeSearchText(value: string | null | undefined): string {
    if (!value)
        return '';
    return value
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .trim();
}

/**
 * Build the term list of one application from its raw name fields, in
 * descending significance. Empty fields are dropped and duplicates collapse,
 * so an application whose translated and untranslated names are equal keeps
 * one term and still ranks by that term's position.
 */
export function appSearchTerms(
    fields: readonly (string | null | undefined)[]
): string[] {
    const terms: string[] = [];
    for (const field of fields) {
        const term = normalizeSearchText(field);
        if (term.length > 0 && !terms.includes(term))
            terms.push(term);
    }
    return terms;
}

// How well one term matches one already normalized query word: exact, prefix,
// prefix of a word inside the term ("files" in "gnome files"), or anywhere.
function termScore(term: string, word: string): number {
    if (term === word)
        return SCORE_EXACT;
    if (term.startsWith(word))
        return SCORE_PREFIX;
    const index = term.indexOf(word);
    if (index < 0)
        return NO_MATCH;
    return WORD_SEPARATORS.test(term.charAt(index - 1))
        ? SCORE_WORD_PREFIX
        : SCORE_SUBSTRING;
}

// Best score of one query word over all of an application's terms; the term's
// position is folded in as the tie-breaker, so the same hit on the display name
// beats one on a keyword. Infinity means the word is not in this application.
function wordScore(app: SearchableApp, word: string): number {
    let best = NO_MATCH;
    for (let index = 0; index < app.terms.length; index += 1) {
        const score = termScore(app.terms[index], word) + Math.min(index, 99);
        if (score < best)
            best = score;
    }
    return best;
}

/** Split a query into the normalized words that must all be matched. */
export function searchWords(query: string): string[] {
    return normalizeSearchText(query)
        .split(WORD_SEPARATORS)
        .filter(word => word.length > 0);
}

/**
 * The applications matching `query`, best first, capped at
 * `MAX_SEARCH_RESULTS`. Every word of the query must be found somewhere in an
 * application's terms (so "fire fox" and "fox fire" both find Firefox);
 * equally ranked applications keep alphabetical order. An empty query matches
 * nothing — the menu shows the selected category instead.
 */
export function matchApps<App extends SearchableApp>(
    apps: readonly App[],
    query: string,
    limit: number = MAX_SEARCH_RESULTS
): App[] {
    const words = searchWords(query);
    if (words.length === 0)
        return [];

    const scored: {app: App; score: number}[] = [];
    for (const app of apps) {
        let score = 0;
        for (const word of words) {
            score += wordScore(app, word);
            if (score === NO_MATCH)
                break;
        }
        if (Number.isFinite(score))
            scored.push({app, score});
    }

    scored.sort(
        (a, b) => a.score - b.score || a.app.name.localeCompare(b.app.name)
    );
    return scored.slice(0, limit).map(({app}) => app);
}
