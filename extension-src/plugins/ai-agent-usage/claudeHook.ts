// @ts-nocheck
// @tag:widget-ai-agent-usage
//
// Shared Claude Code hook helpers, usable from both the GNOME Shell process
// (the widget) and the preferences process (the "Configure" button). Pure
// Gio/GLib file operations, so this module must not import any shell-only code.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const HOOK_NAME = 'gnome-widget-panel-claude-hook.js';

export function claudeDir() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
}

export function hookPath() {
    return GLib.build_filenamev([claudeDir(), HOOK_NAME]);
}

export function settingsPath() {
    return GLib.build_filenamev([claudeDir(), 'settings.json']);
}

// Whether Claude Code is present for this user (its config directory exists).
export function isClaudeInstalled() {
    return GLib.file_test(claudeDir(), GLib.FileTest.IS_DIR);
}

export function hookScript(port, secret) {
    return `#!/usr/bin/env gjs
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const PORT = ${JSON.stringify(port)};
const SECRET = ${JSON.stringify(secret)};

function readStdin() {
    const [ok, contents] = GLib.file_get_contents('/dev/stdin');
    return ok ? contents : new Uint8Array();
}

const session = new Soup.Session();
const message = Soup.Message.new('POST', \`http://127.0.0.1:\${PORT}/claude-statusline\`);
message.request_headers.append('X-Gnome-Widget-Panel-Token', SECRET);
message.set_request_body_from_bytes(
    'application/json',
    GLib.Bytes.new(readStdin())
);
const bytes = session.send_and_read(message, null);
if (message.get_status() !== Soup.Status.OK)
    printerr(\`gnome-widget-panel Claude hook HTTP \${message.get_status()}\\n\`);
else
    print(new TextDecoder().decode(bytes.get_data()));
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

// Write the hook script and point Claude's statusLine at it. Returns true on
// success. Throws on unexpected I/O errors so callers can report them.
export function installHook(port, secret) {
    GLib.mkdir_with_parents(claudeDir(), 0o700);
    atomicWrite(hookPath(), hookScript(port, secret), 0o700);

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
