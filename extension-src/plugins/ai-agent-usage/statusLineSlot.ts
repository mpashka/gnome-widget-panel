// @tag:widget-ai-agent-usage
//
// Who holds Claude Code's status-line slot, and what the panel may write because
// of it. `statusLine` is one setting with one command, so writing it takes the
// line from whoever had it; the panel does that only when the slot is empty or
// already its own. Gi-free — every path and every file read comes in from the
// caller — so the decision table is unit-tested in plain Node
// (`../../../tests/statusLineSlot.test.mjs`). File I/O stays in `claudeHook.ts`.

/**
 * - `free` — no `statusLine` and no segment directory: the panel takes the slot.
 * - `ours` — the slot already runs the panel's hook: nothing to take.
 * - `dispatched` — a dispatcher in the slot reads the segment directory: the
 *   panel drops its segment there and leaves the setting alone.
 * - `taken` — somebody else's command, which reads no segment directory.
 * - `orphan` — a segment directory, but nothing in the slot that would run it.
 * - `unreadable` — `settings.json` is not a JSON object, so nothing in it can be
 *   known and rewriting it would lose whatever it holds.
 */
export type SlotState = 'free' | 'ours' | 'dispatched' | 'taken' | 'orphan' | 'unreadable';

/** What is on disk, as the caller found it. */
export interface SlotQuery {
    /** `~/.claude/settings.json` contents; `null` when the file does not exist. */
    settingsText: string | null;
    /** The command the panel itself puts in the slot. */
    hookPath: string;
    /** The directory a dispatcher composes the line from. */
    segmentsDir: string;
    segmentsDirExists: boolean;
    /** Expands `~` and `$HOME` in the slot's command. */
    home: string;
}

/**
 * The beginning of a file the slot's command names, or `null` when there is no
 * such file or it cannot be read. A prefix is enough: it is searched for the
 * segment directory's name, and the command may name a large binary.
 */
export type ReadTextHead = (path: string) => Promise<string | null>;

export interface SlotReport {
    state: SlotState;
    /** The slot's command as written in `settings.json`, when there is one. */
    command: string | null;
}

/** What `installHook()` writes in a state. An absent field is a file left alone. */
export interface SlotWrites {
    /** The slot-owning hook script. */
    hook?: true;
    /** The segment in the dispatcher's directory. */
    segment?: true;
    /** New contents of `settings.json`. */
    settingsText?: string;
}

const COMMAND_TOKEN = /"([^"]*)"|'([^']*)'|(\S+)/g;
const PROBED_PATHS = 4;


function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function parseSettings(settingsText: string | null): Record<string, unknown> | null {
    if (settingsText === null)
        return {};
    try {
        const settings = JSON.parse(settingsText);
        return isPlainObject(settings) ? settings : null;
    } catch (_error) {
        return null;
    }
}


function commandTokens(command: string, home: string): string[] {
    return [...command.matchAll(COMMAND_TOKEN)].map((match) =>
        (match[1] ?? match[2] ?? match[3]).replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home)
    );
}


function baseName(path: string): string {
    return path.replace(/\/+$/, '').split('/').pop();
}


/**
 * Decide who holds the slot. The slot's command counts as a dispatcher when it
 * names the segment directory — in the command itself or in the text of a file
 * the command names — because the directory existing proves only that somebody
 * created it, not that anything reads it.
 */
export async function evaluateSlot(query: SlotQuery, readTextHead: ReadTextHead): Promise<SlotReport> {
    const settings = parseSettings(query.settingsText);
    if (settings === null)
        return {state: 'unreadable', command: null};

    const statusLine = settings.statusLine;
    if (statusLine === undefined || statusLine === null)
        return {state: query.segmentsDirExists ? 'orphan' : 'free', command: null};

    const command = isPlainObject(statusLine) && typeof statusLine.command === 'string'
        ? statusLine.command
        : null;
    if (command === null)
        return {state: 'taken', command: null};

    const tokens = commandTokens(command, query.home);
    if (tokens.length === 1 && tokens[0] === query.hookPath)
        return {state: 'ours', command};
    if (!query.segmentsDirExists)
        return {state: 'taken', command};

    const segmentsName = baseName(query.segmentsDir);
    if (command.includes(segmentsName))
        return {state: 'dispatched', command};

    const paths = tokens.filter((token) => token.startsWith('/')).slice(0, PROBED_PATHS);
    const texts = [];
    for (const path of paths)
        texts.push(await readTextHead(path));
    if (texts.some((text) => text !== null && text.includes(segmentsName)))
        return {state: 'dispatched', command};
    // A command whose every file is gone is what an uninstalled dispatcher
    // leaves behind: nothing will ever run the directory.
    if (paths.length > 0 && texts.every((text) => text === null))
        return {state: 'orphan', command};
    return {state: 'taken', command};
}


/**
 * The files `installHook()` writes in `state`. Only `free` touches
 * `settings.json`; `taken`, `orphan` and `unreadable` write nothing at all,
 * because what is there is somebody's configuration.
 */
export function planSlotWrites(state: SlotState, settingsText: string | null, hookPath: string): SlotWrites {
    switch (state) {
    case 'free': {
        const settings = parseSettings(settingsText);
        settings.statusLine = {type: 'command', command: hookPath};
        return {hook: true, settingsText: `${JSON.stringify(settings, null, 2)}\n`};
    }
    case 'ours':
        return {hook: true};
    case 'dispatched':
        return {segment: true};
    default:
        return {};
    }
}
