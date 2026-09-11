// @tag:build-stamp @tag:versioning
//
// Which build is this? `version-name` alone cannot answer that: it only moves on
// a release, so every build of unreleased work carries the same `0.1.2`. So
// `./gwp build` writes `build-stamp.json` into the built tree — the commit it
// was built from, whether that tree had uncommitted changes, and the instant the
// build finished — and the file travels with the tree into the install.
//
// Two readers, one file: the handle menu shows the identity (`systemInfo.ts` →
// `controlButton.ts`), and the version-status widget compares `builtAtMs` with
// the moment its own modules were loaded to tell whether a logout/login is
// pending (`plugins/version-status/`).
//
// Deliberately free of any `gi://` import: it is parsing and formatting, unit
// tested by Node (`../tests/buildStamp.test.mjs`). Reading the file needs Gio and
// lives in `systemInfo.ts`.

/** One build's identity, as `./gwp build` writes it into `build-stamp.json`. */
export interface BuildStamp {
    /** `version-name (commit[-dirty])`, e.g. `0.2.3 (6308c4b-dirty)`. */
    label: string;
    /** Wall clock, in milliseconds, at which that build finished. */
    builtAtMs: number;
    /** The same instant as ISO 8601, for display only. */
    builtAt?: string;
    /** Short commit the tree was at; absent when built outside a checkout. */
    commit?: string;
    /** Whether that tree had uncommitted changes when it was built. */
    dirty?: boolean;
}

/**
 * Parse the contents of `build-stamp.json`. Untrusted input: anything that is
 * not JSON carrying a string `label` and a finite numeric `builtAtMs` yields
 * null, which callers report as "unknown build". `commit`/`dirty` are optional —
 * a stamp written by an older `./gwp build` has neither, and a menu without the
 * commit is exactly what this repository showed before they existed.
 */
export function parseBuildStamp(raw: string): BuildStamp | null {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch (_e) {
        return null;
    }
    if (!data || typeof data !== 'object')
        return null;
    const item = data as {
        label?: unknown;
        builtAtMs?: unknown;
        builtAt?: unknown;
        commit?: unknown;
        dirty?: unknown;
    };
    if (typeof item.label !== 'string' || !item.label)
        return null;
    if (typeof item.builtAtMs !== 'number' || !Number.isFinite(item.builtAtMs))
        return null;
    const stamp: BuildStamp = {label: item.label, builtAtMs: item.builtAtMs};
    if (typeof item.builtAt === 'string' && item.builtAt)
        stamp.builtAt = item.builtAt;
    if (typeof item.commit === 'string' && item.commit)
        stamp.commit = item.commit;
    if (item.dirty === true)
        stamp.dirty = true;
    return stamp;
}

/**
 * The build's identity as one short token — `6308c4b`, or `6308c4b-dirty` when
 * the tree it was built from had uncommitted changes. Empty when the stamp is
 * missing or carries no commit, so callers can simply leave it out.
 */
export function formatBuildId(stamp: BuildStamp | null | undefined): string {
    if (!stamp || !stamp.commit)
        return '';
    return stamp.dirty ? `${stamp.commit}-dirty` : stamp.commit;
}
