// @ts-nocheck
// @tag:widget-ai-agent-usage
//
// Shared Claude Code hook helpers, usable from both the GNOME Shell process
// (the widget) and the preferences process (the "Configure" button). Pure
// Gio/GLib file operations, so this module must not import any shell-only code.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const HOOK_NAME = 'gnome-widget-panel-claude-hook.js';
export const PORTS_NAME = 'gnome-widget-panel-ports.json';

export function claudeDir() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
}

export function hookPath() {
    return GLib.build_filenamev([claudeDir(), HOOK_NAME]);
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
export function hookScript() {
    return `#!/usr/bin/env gjs
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const REGISTRY = ${JSON.stringify(portsRegistryPath())};

function readStdin() {
    const [ok, contents] = GLib.file_get_contents('/dev/stdin');
    return ok ? contents : new Uint8Array();
}

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

function atomicWrite(path, contents, mode) {
    const file = Gio.File.new_for_path(path);
    file.replace_contents(
        new TextEncoder().encode(contents),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
    );
    try {
        GLib.chmod(path, mode);
    } catch (error) {
        console.error(`GNOME Widget Panel AI usage chmod failed: ${error}`);
    }
}

// Write the (port-independent) hook script and point Claude's statusLine at it.
// Idempotent: repeated calls from multiple instances write identical content.
// Returns true on success. Throws on unexpected I/O errors so callers can report.
export function installHook() {
    GLib.mkdir_with_parents(claudeDir(), 0o700);
    atomicWrite(hookPath(), hookScript(), 0o700);

    let settings = {};
    const path = settingsPath();
    if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
        const [ok, contents] = GLib.file_get_contents(path);
        if (ok) {
            try {
                settings = JSON.parse(new TextDecoder().decode(contents));
            } catch (error) {
                settings = {};
            }
        }
    }
    settings.statusLine = {type: 'command', command: hookPath()};
    atomicWrite(path, `${JSON.stringify(settings, null, 2)}\n`, 0o600);
    return true;
}

function readRegistry() {
    const path = portsRegistryPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return [];
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (!ok)
            return [];
        const data = JSON.parse(new TextDecoder().decode(contents));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

function writeRegistry(entries) {
    GLib.mkdir_with_parents(claudeDir(), 0o700);
    atomicWrite(
        portsRegistryPath(),
        `${JSON.stringify(entries, null, 2)}\n`,
        0o600
    );
}

// Register this instance's endpoint (deduping by port) so the hook fans out to
// it. Best-effort read-modify-write; called when a widget starts its server.
export function registerPort(port, secret) {
    const entries = readRegistry().filter(
        (entry) => Number(entry?.port) !== Number(port)
    );
    entries.push({port: Number(port), secret: String(secret)});
    writeRegistry(entries);
}

// Remove this instance's endpoint from the registry (called on destroy).
export function deregisterPort(port) {
    const entries = readRegistry().filter(
        (entry) => Number(entry?.port) !== Number(port)
    );
    writeRegistry(entries);
}

// 'not-installed' | 'unconfigured' | 'ok'
export function configStatus() {
    if (!isClaudeInstalled())
        return 'not-installed';
    if (!GLib.file_test(hookPath(), GLib.FileTest.EXISTS))
        return 'unconfigured';
    const path = settingsPath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return 'unconfigured';
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok)
        return 'unconfigured';
    try {
        const settings = JSON.parse(new TextDecoder().decode(contents));
        if (settings?.statusLine?.command === hookPath())
            return 'ok';
    } catch (error) {
        // fall through
    }
    return 'unconfigured';
}
