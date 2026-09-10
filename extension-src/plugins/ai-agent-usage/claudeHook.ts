// @ts-nocheck
// @tag:widget-ai-agent-usage
//
// Shared Claude Code hook helpers, usable from both the GNOME Shell process
// (the widget) and the preferences process (the "Configure" button). Pure
// Gio/GLib file operations, so this module must not import any shell-only code.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {eventHookScriptText, hookScriptText} from './hookScriptText.js';
import {evaluateSlot, planSlotWrites} from './statusLineSlot.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Gio.InputStream.prototype, 'close_async', 'close_finish');

export const HOOK_NAME = 'gnome-widget-panel-claude-hook.js';
export const EVENT_HOOK_NAME = 'gnome-widget-panel-agent-event-hook.js';
export const PORTS_NAME = 'gnome-widget-panel-ports.json';
export const CAPTIONS_NAME = 'statusline';

// Where a status-line dispatcher, if the user runs one, looks for segments. The
// `statusLine` setting holds one command and no array, so whoever writes it owns
// the whole line; a dispatcher takes that slot and composes the line out of
// independent executables dropped in this directory instead.
export const SEGMENTS_DIR_NAME = 'status_line.d';
export const SEGMENT_NAME = '90-gnome-widget-panel';

// Claude Code lifecycle events forwarded by the event hook (used by the
// ai-agent-status widget's per-session state machine).
export const EVENT_HOOK_EVENTS = [
    'UserPromptSubmit',
    'Stop',
    'Notification',
    'SessionEnd',
];

export function claudeDir() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
}

export function hookPath() {
    return GLib.build_filenamev([claudeDir(), HOOK_NAME]);
}

export function eventHookPath() {
    return GLib.build_filenamev([claudeDir(), EVENT_HOOK_NAME]);
}

export function settingsPath() {
    return GLib.build_filenamev([claudeDir(), 'settings.json']);
}

export function segmentsDir() {
    return GLib.build_filenamev([claudeDir(), SEGMENTS_DIR_NAME]);
}

export function segmentPath() {
    return GLib.build_filenamev([segmentsDir(), SEGMENT_NAME]);
}

// Shared registry of live widget endpoints (`[{port, secret}, ...]`). Every
// running ai-agent-usage instance registers its own port here; the hook fans a
// status-line request out to all of them. This lets several panel instances
// (e.g. your main session and a dev session on a different port) each receive
// Claude data without fighting over a single hook target.
export function portsRegistryPath() {
    return GLib.build_filenamev([claudeDir(), PORTS_NAME]);
}

// Where the hook looks up a session's caption: `<captions>/<session_id>.json`
// holding `{place, task}`, both optional strings. Written by whoever knows what
// the session is working on (here, the user's task dispatcher), because the
// statusLine payload carries a directory and no notion of a task at all.
//
// Read-only and best-effort by design: no file means no caption and the line
// falls back to the directory's own name, so an install with nobody writing
// captions is not degraded — it shows exactly what it showed before.
export function captionsDir() {
    return GLib.build_filenamev([claudeDir(), CAPTIONS_NAME]);
}

// Whether Claude Code is present for this user (its config directory exists).
export function isClaudeInstalled() {
    return GLib.file_test(claudeDir(), GLib.FileTest.IS_DIR);
}

// The GSettings schema is installed with the extension, not into the system
// schema source, so the generated hook — a standalone gjs process — has to load
// it from a directory. This module is `<extension>/plugins/ai-agent-usage/
// claudeHook.js`, so the schema directory is three levels up plus `schemas`;
// deriving it from `import.meta.url` keeps every caller (widget and prefs
// process alike) from having to pass an extension path down.
function schemasDir() {
    const [self] = GLib.filename_from_uri(import.meta.url);
    const pluginDir = GLib.path_get_dirname(self);
    const pluginsDir = GLib.path_get_dirname(pluginDir);
    return GLib.build_filenamev([GLib.path_get_dirname(pluginsDir), 'schemas']);
}

export const SETTINGS_SCHEMA_ID = 'org.gnome.shell.extensions.floating-mini-panel';

// The setting that decides whether anything is listening. It used to be "is an
// AI widget in the panel configuration", which was the wrong question twice
// over: collection is no longer a widget's job (see ../../aiCollector.ts), and
// a user who wanted the data without a widget on screen had no way to say so.
const COLLECTOR_KEY = 'ai-collector';

// The two generated hook scripts. Their text is gi-free and lives in
// `hookScriptText.ts` (tested in plain Node); here they only get this install's
// paths. `{segment: true}` is the shape written into a dispatcher's segment
// directory — see `statusLineSlot.ts`.
export function hookScript(options = {}) {
    return hookScriptText(
        {
            registry: portsRegistryPath(),
            captions: captionsDir(),
            schemaDir: schemasDir(),
            schemaId: SETTINGS_SCHEMA_ID,
            collectorKey: COLLECTOR_KEY,
        },
        options
    );
}

export function eventHookScript() {
    return eventHookScriptText(portsRegistryPath());
}

// Serialize read-modify-write file operations on the shared ~/.claude files.
// GJS is single-threaded, but the `await` between reading a JSON file and
// writing it back lets concurrent calls interleave and lose updates — e.g. the
// ai-agent-usage and ai-agent-status widgets both register their port in the
// shared ports registry at panel start, or two installs merge settings.json.
// Chaining every mutating operation on one promise restores the atomicity the
// previous synchronous code had (and preserves call order, so a start's
// registerPort always completes before a destroy's deregisterPort).
let _ioLock = Promise.resolve();
function withIoLock(fn) {
    const run = _ioLock.then(fn, fn);
    _ioLock = run.then(
        () => undefined,
        () => undefined
    );
    return run;
}

// Write via our own temp file so the mode is already on the inode when it
// becomes `path`. Replacing `path` directly creates a fresh file at the umask
// default and only chmods it afterwards; a process killed in that window (a dev
// shell restart, a closed prefs window) leaves the hook world-readable and
// **not executable**, and Claude Code then fails every hook invocation with
// "Permission denied" until someone chmods it by hand.
async function atomicWrite(path, contents, mode) {
    const temp = Gio.File.new_for_path(`${path}.${GLib.uuid_string_random()}.tmp`);
    try {
        await temp.replace_contents_bytes_async(
            GLib.Bytes.new(new TextEncoder().encode(contents)),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        GLib.chmod(temp.get_path(), mode);
        temp.move(
            Gio.File.new_for_path(path),
            Gio.FileCopyFlags.OVERWRITE,
            null,
            null
        );
    } catch (error) {
        try {
            temp.delete(null);
        } catch (_e) {
            // Nothing to clean up: the temp was never created.
        }
        throw error;
    }
}

// The slot's command may name any file, a large binary included; telling a
// dispatcher apart needs only enough of it to find the segment directory's name.
const SLOT_PROBE_BYTES = 64 * 1024;

async function readTextHead(path) {
    try {
        const stream = await Gio.File.new_for_path(path).read_async(GLib.PRIORITY_DEFAULT, null);
        try {
            const bytes = await stream.read_bytes_async(SLOT_PROBE_BYTES, GLib.PRIORITY_DEFAULT, null);
            return new TextDecoder().decode(bytes.toArray());
        } finally {
            stream.close_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
        }
    } catch (_error) {
        return null;
    }
}


async function readSettingsText() {
    const path = settingsPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return null;
    // load_contents_async resolves to [contents, etag]; it throws on failure.
    const [contents] = await Gio.File.new_for_path(path).load_contents_async(null);
    return new TextDecoder().decode(contents);
}


function evaluateCurrentSlot(settingsText) {
    return evaluateSlot(
        {
            settingsText,
            hookPath: hookPath(),
            segmentsDir: segmentsDir(),
            segmentsDirExists: GLib.file_test(segmentsDir(), GLib.FileTest.IS_DIR),
            home: GLib.get_home_dir(),
        },
        readTextHead
    );
}


// Write what the status-line slot allows (`statusLineSlot.ts`): the panel's own
// hook when the slot is empty or already the panel's, a segment when a
// dispatcher owns the line, nothing over somebody else's configuration.
// Idempotent. Returns the slot as found; throws on unexpected I/O errors so
// callers can report.
export async function installHook() {
    return withIoLock(async () => {
        GLib.mkdir_with_parents(claudeDir(), 0o700);
        const settingsText = await readSettingsText();
        const slot = await evaluateCurrentSlot(settingsText);
        const writes = planSlotWrites(slot.state, settingsText, hookPath());
        if (writes.hook)
            await atomicWrite(hookPath(), hookScript(), 0o700);
        if (writes.segment)
            await atomicWrite(segmentPath(), hookScript({segment: true}), 0o700);
        if (writes.settingsText !== undefined)
            await atomicWrite(settingsPath(), writes.settingsText, 0o600);
        if (!writes.hook && !writes.segment) {
            const command = slot.command === null ? '' : ` (${slot.command})`;
            console.warn(`widget-panel: Claude status line is ${slot.state}${command}; left untouched`);
        }
        return slot;
    });
}

// True when this settings.json hooks entry already runs our event hook.
function entryRunsEventHook(entry) {
    return Array.isArray(entry?.hooks) && entry.hooks.some(
        (hook) => hook?.type === 'command' && hook?.command === eventHookPath()
    );
}

// Write the (port-independent) event hook script and idempotently merge it into
// Claude's settings.json `hooks` for every EVENT_HOOK_EVENTS event. Existing
// user-defined hooks are preserved: for each event we only append one entry
// `{hooks: [{type:'command', command: eventHookPath()}]}` (no matcher — these
// events do not use matchers) when no entry already references our script.
// Returns true on success. Throws on unexpected I/O errors so callers can report.
export async function installEventHooks() {
    return withIoLock(async () => {
        GLib.mkdir_with_parents(claudeDir(), 0o700);
        await atomicWrite(eventHookPath(), eventHookScript(), 0o700);

        let settings = {};
        const path = settingsPath();
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            const file = Gio.File.new_for_path(path);
            // load_contents_async resolves to [contents, etag] (Uint8Array, no
            // leading boolean); it throws on failure (the file exists, checked
            // above).
            const [contents] = await file.load_contents_async(null);
            try {
                settings = JSON.parse(new TextDecoder().decode(contents));
            } catch (error) {
                settings = {};
            }
        }
        if (typeof settings !== 'object' || settings === null || Array.isArray(settings))
            settings = {};
        if (typeof settings.hooks !== 'object' || settings.hooks === null || Array.isArray(settings.hooks))
            settings.hooks = {};
        for (const event of EVENT_HOOK_EVENTS) {
            const entries = Array.isArray(settings.hooks[event])
                ? settings.hooks[event]
                : [];
            if (!entries.some(entryRunsEventHook))
                entries.push({hooks: [{type: 'command', command: eventHookPath()}]});
            settings.hooks[event] = entries;
        }
        await atomicWrite(path, `${JSON.stringify(settings, null, 2)}\n`, 0o600);
        return true;
    });
}

// 'not-installed' | 'unconfigured' | 'ok' — like configStatus(), but for the
// lifecycle-event hooks used by the ai-agent-status widget.
export async function eventHooksStatus() {
    if (!isClaudeInstalled())
        return 'not-installed';
    // IS_EXECUTABLE, not EXISTS: Claude Code runs the hook file directly, so a
    // present-but-not-executable script is a broken install, and reporting it
    // as 'ok' would hide the one action that repairs it.
    if (!GLib.file_test(eventHookPath(), GLib.FileTest.IS_EXECUTABLE))
        return 'unconfigured';
    const path = settingsPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return 'unconfigured';
    const file = Gio.File.new_for_path(path);
    try {
        const [contents] = await file.load_contents_async(null);
        const settings = JSON.parse(new TextDecoder().decode(contents));
        const hooks = settings?.hooks;
        const configured = EVENT_HOOK_EVENTS.every(
            (event) => Array.isArray(hooks?.[event])
                && hooks[event].some(entryRunsEventHook)
        );
        if (configured)
            return 'ok';
    } catch (error) {
        // fall through
    }
    return 'unconfigured';
}

async function readRegistry() {
    const path = portsRegistryPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return [];
    try {
        const file = Gio.File.new_for_path(path);
        const [contents] = await file.load_contents_async(null);
        const data = JSON.parse(new TextDecoder().decode(contents));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

async function writeRegistry(entries) {
    GLib.mkdir_with_parents(claudeDir(), 0o700);
    await atomicWrite(
        portsRegistryPath(),
        `${JSON.stringify(entries, null, 2)}\n`,
        0o600
    );
}

// Register this instance's endpoint (deduping by port) so the hook fans out to
// it. Best-effort read-modify-write; called when a widget starts its server.
export async function registerPort(port, secret) {
    return withIoLock(async () => {
        const entries = (await readRegistry()).filter(
            (entry) => Number(entry?.port) !== Number(port)
        );
        entries.push({port: Number(port), secret: String(secret)});
        await writeRegistry(entries);
    });
}

// Remove this instance's endpoint from the registry (called on destroy).
export async function deregisterPort(port) {
    return withIoLock(async () => {
        const entries = (await readRegistry()).filter(
            (entry) => Number(entry?.port) !== Number(port)
        );
        await writeRegistry(entries);
    });
}

// 'not-installed' | 'unconfigured' | 'ok'. Only a file the slot actually runs
// counts: a segment in a directory nothing dispatches is not an install.
export async function configStatus() {
    if (!isClaudeInstalled())
        return 'not-installed';
    let slot;
    try {
        slot = await evaluateCurrentSlot(await readSettingsText());
    } catch (_error) {
        return 'unconfigured';
    }
    const runs = {ours: hookPath(), dispatched: segmentPath()}[slot.state];
    // IS_EXECUTABLE — see eventHooksStatus().
    return runs && GLib.file_test(runs, GLib.FileTest.IS_EXECUTABLE)
        ? 'ok'
        : 'unconfigured';
}
