// @tag:versioning
//
// Release channel and version-label formatting. This module is deliberately
// free of any `gi://` import so it loads unchanged in both the GNOME Shell and
// the preferences process, and can be unit tested by Node (see
// `../tests/version.test.mjs`).
//
// The numeric `version` (EGO version code) and the human-readable
// `version-name` (semver `A.B.C`) live in `metadata.json` — the single source
// EGO reads and the release workflow bumps. This module owns only the
// human-facing *release channel* badge (`alpha`) shown next to the version in
// the control-button menu and the preferences About group, plus the helper that
// formats the two together. Set `RELEASE_CHANNEL` to `''` for a stable release.
//
// See ../docs/release.md.

/**
 * Pre-release channel shown as a badge next to the version. Empty string means a
 * stable release (no badge). Currently `alpha` (pre-publication / early
 * testing); see the release policy in ../docs/release.md.
 */
export const RELEASE_CHANNEL: string = 'alpha';

/**
 * Format a version name plus the release channel for display, e.g.
 * `formatVersionLabel('0.1.0')` -> `'0.1.0 (alpha)'`, or just `'0.1.0'` when the
 * channel is empty (stable). Falls back to `'unknown'` for an empty version.
 */
export function formatVersionLabel(
    versionName: string,
    channel: string = RELEASE_CHANNEL
): string {
    const name = versionName ? String(versionName) : 'unknown';
    return channel ? `${name} (${channel})` : name;
}
