// @tag:widget-version-status @tag:build-stamp
//
// The verdict behind the version-status widget, kept free of any `gi://` import
// so it is plain logic and unit-testable in Node (see
// ../../../tests/versionState.test.mjs). The stamp itself — its fields, its
// parser — belongs to ../../buildStamp.ts; file reading, the panel button and
// the timers live in `index.ts`.
//
// Two instants decide everything: when the running code was loaded into this
// gnome-shell process, and when the build now on disk was made.

import type {BuildStamp} from '../../buildStamp.js';

/**
 * `current` — the running code is the build on disk; `stale` — a newer build is
 * installed and only a logout/login will run it; `unknown` — no build stamp
 * beside the extension (a store install, or a tree built before stamps).
 */
export type VersionStateKind = 'current' | 'stale' | 'unknown';

/** Everything the panel button shows for one verdict. */
export interface VersionState {
    kind: VersionStateKind;
    /**
     * Whether the button is on screen at all. This widget is a warning plus the
     * action that clears it, so once the running build *is* the installed one it
     * has nothing to say and takes no panel space (UX: a warning is shown only
     * while it stands).
     */
    visible: boolean;
    /** Symbolic icon name for the button. */
    icon: string;
    /** Text beside the icon; empty for an icon-only button. */
    text: string;
    /** Hover text, one fact per line. */
    tooltip: string;
}

/** What `evaluateVersionState` needs to know to reach a verdict. */
export interface VersionStateInput {
    /** `Date.now()` captured when the extension's modules were loaded. */
    loadedAt: number;
    /** The stamp read from disk, or null when there is none. */
    stamp: BuildStamp | null;
    /** Label of the build that is running, once a read has established it. */
    runningLabel?: string | null;
}

const ICON_STALE = 'software-update-urgent-symbolic';
const ICON_UNKNOWN = 'dialog-question-symbolic';
// Never on screen while `current` hides the button; kept so the state is a
// complete description of a button rather than a hole, and so showing it (a
// debug session, a UI test reading the verdict) needs no special case.
const ICON_CURRENT = 'object-select-symbolic';

/** Local `HH:MM:SS` of a wall-clock instant, for the tooltip. */
function formatTime(ms: number): string {
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}


/**
 * The verdict. A build stamped later than the moment the running modules were
 * loaded can only have arrived after this shell started, so the code on disk is
 * ahead of the code in memory and a relogin is pending.
 */
export function evaluateVersionState(input: VersionStateInput): VersionState {
    const {loadedAt, stamp} = input;
    const runningLabel = input.runningLabel ?? null;

    if (!stamp) {
        // Nothing to compare against: shown, because a developer widget that
        // cannot answer its own question is itself the thing worth noticing.
        return {
            kind: 'unknown',
            visible: true,
            icon: ICON_UNKNOWN,
            text: '',
            tooltip: [
                'Unknown build: no build-stamp.json beside the extension.',
                'Installed from extensions.gnome.org, or built without ./gwp build.',
            ].join('\n'),
        };
    }

    if (stamp.builtAtMs > loadedAt) {
        return {
            kind: 'stale',
            visible: true,
            icon: ICON_STALE,
            text: 'relogin',
            tooltip: [
                `Installed: ${stamp.label}, built ${formatTime(stamp.builtAtMs)}`,
                `Running: ${runningLabel ?? `the build loaded at ${formatTime(loadedAt)}`}`,
                'Log out and log back in to run the installed build.',
            ].join('\n'),
        };
    }

    // The running build is the installed build: no warning, no action, no
    // button. The tooltip is kept for the UI test, which reads the verdict
    // rather than the screen.
    return {
        kind: 'current',
        visible: false,
        icon: ICON_CURRENT,
        text: '',
        tooltip: [
            `Running the installed build: ${stamp.label}`,
            `Built ${formatTime(stamp.builtAtMs)}, loaded ${formatTime(loadedAt)}`,
        ].join('\n'),
    };
}
