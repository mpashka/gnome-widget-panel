// @ts-nocheck
// @tag:widget-ai-agent-usage
//
// Shared Claude Code hook helpers, usable from both the GNOME Shell process
// (the widget) and the preferences process (the "Configure" button). Pure
// Gio/GLib file operations, so this module must not import any shell-only code.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {READ_STDIN_FN} from './hookStdin.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');

export const HOOK_NAME = 'gnome-widget-panel-claude-hook.js';
export const EVENT_HOOK_NAME = 'gnome-widget-panel-agent-event-hook.js';
export const PORTS_NAME = 'gnome-widget-panel-ports.json';

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

// Shared registry of live widget endpoints (`[{port, secret}, ...]`). Every
// running ai-agent-usage instance registers its own port here; the hook fans a
// status-line request out to all of them. This lets several panel instances
// (e.g. your main session and a dev session on a different port) each receive
// Claude data without fighting over a single hook target.
export function portsRegistryPath() {
    return GLib.build_filenamev([claudeDir(), PORTS_NAME]);
}

// Whether Claude Code is present for this user (its config directory exists).
export function isClaudeInstalled() {
    return GLib.file_test(claudeDir(), GLib.FileTest.IS_DIR);
}

// Port-independent hook: it reads the shared registry at run time and POSTs the
// Claude stdin payload to every registered endpoint, printing the first OK
// status line. Because the hook file content no longer embeds a port/secret,
// multiple running widgets no longer overwrite each other's hook — they only add
// their endpoint to the registry.
//
// The shebang MUST be `env -S gjs -m`: Claude Code invokes this file directly
// (honouring the shebang), and the body below uses ES module `import`
// statements, which are only valid in gjs's module mode (`-m`/`--module`); a
// bare `gjs` shebang runs the legacy import system and the script throws
// `SyntaxError: import declarations may only appear at top level of a module`
// on every invocation, silently dropping every sample (issue #6).
export function hookScript() {
    return `#!/usr/bin/env -S gjs -m
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const REGISTRY = ${JSON.stringify(portsRegistryPath())};

${READ_STDIN_FN}

function readEndpoints() {
    try {
        const [ok, contents] = GLib.file_get_contents(REGISTRY);
        if (!ok)
            return [];
        const data = JSON.parse(new TextDecoder().decode(contents));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

const stdin = readStdin();
const session = new Soup.Session();
let output = null;
for (const endpoint of readEndpoints()) {
    const port = Number(endpoint && endpoint.port);
    if (!Number.isFinite(port) || port <= 0)
        continue;
    try {
        const message = Soup.Message.new('POST', \`http://127.0.0.1:\${port}/claude-statusline\`);
        message.request_headers.append('X-Gnome-Widget-Panel-Token', String(endpoint.secret ?? ''));
        message.set_request_body_from_bytes('application/json', GLib.Bytes.new(stdin));
        const bytes = session.send_and_read(message, null);
        if (message.get_status() === Soup.Status.OK && output === null)
            output = new TextDecoder().decode(bytes.get_data());
    } catch (error) {
        // Skip an unreachable endpoint (stale registry entry).
    }
}
if (output !== null)
    print(output);
`;
}

// Port-independent lifecycle-event hook (UserPromptSubmit / Stop / Notification
// / SessionEnd). Mirrors hookScript(): it reads the shared ports registry at
// run time and POSTs the raw Claude stdin payload to `/agent-event` on every
// registered endpoint. Unlike the status-line hook it must print NOTHING —
// Claude interprets a Stop hook's stdout — and always exit 0, quickly, so it
// never disturbs or blocks the Claude session it observes. See hookScript()
// for why the shebang must be `env -S gjs -m`.
export function eventHookScript() {
    return `#!/usr/bin/env -S gjs -m
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const REGISTRY = ${JSON.stringify(portsRegistryPath())};

${READ_STDIN_FN}

function readEndpoints() {
    try {
        const [ok, contents] = GLib.file_get_contents(REGISTRY);
        if (!ok)
            return [];
        const data = JSON.parse(new TextDecoder().decode(contents));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

const stdin = readStdin();
const session = new Soup.Session({timeout: 3});
for (const endpoint of readEndpoints()) {
    const port = Number(endpoint && endpoint.port);
    if (!Number.isFinite(port) || port <= 0)
        continue;
    try {
        const message = Soup.Message.new('POST', \`http://127.0.0.1:\${port}/agent-event\`);
        message.request_headers.append('X-Gnome-Widget-Panel-Token', String(endpoint.secret ?? ''));
        message.set_request_body_from_bytes('application/json', GLib.Bytes.new(stdin));
        session.send_and_read(message, null);
    } catch (error) {
        // Skip an unreachable endpoint (stale registry entry); stay silent.
    }
}
`;
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

async function atomicWrite(path, contents, mode) {
    const file = Gio.File.new_for_path(path);
    await file.replace_contents_bytes_async(
        GLib.Bytes.new(new TextEncoder().encode(contents)),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
    );
    try {
        GLib.chmod(path, mode);
    } catch (error) {
        logError(error, 'GNOME Widget Panel AI usage chmod failed');
    }
}

// Write the (port-independent) hook script and point Claude's statusLine at it.
// Idempotent: repeated calls from multiple instances write identical content.
// Returns true on success. Throws on unexpected I/O errors so callers can report.
export async function installHook() {
    return withIoLock(async () => {
        GLib.mkdir_with_parents(claudeDir(), 0o700);
        await atomicWrite(hookPath(), hookScript(), 0o700);

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
        settings.statusLine = {type: 'command', command: hookPath()};
        await atomicWrite(path, `${JSON.stringify(settings, null, 2)}\n`, 0o600);
        return true;
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
    if (!GLib.file_test(eventHookPath(), GLib.FileTest.EXISTS))
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

// 'not-installed' | 'unconfigured' | 'ok'
export async function configStatus() {
    if (!isClaudeInstalled())
        return 'not-installed';
    if (!GLib.file_test(hookPath(), GLib.FileTest.EXISTS))
        return 'unconfigured';
    const path = settingsPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return 'unconfigured';
    const file = Gio.File.new_for_path(path);
    try {
        const [contents] = await file.load_contents_async(null);
        const settings = JSON.parse(new TextDecoder().decode(contents));
        if (settings?.statusLine?.command === hookPath())
            return 'ok';
    } catch (error) {
        // fall through
    }
    return 'unconfigured';
}
