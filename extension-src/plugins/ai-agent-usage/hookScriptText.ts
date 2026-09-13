// @tag:widget-ai-agent-usage
//
// The text of the two generated Claude Code hooks. Gi-free on purpose — every
// path it needs is passed in — so the scripts the panel writes into a user's
// `~/.claude` are unit-tested in plain Node (see
// `../../../tests/hookScriptText.test.mjs`) instead of only being read by a
// human after a shell restart. File I/O and where the paths come from stay in
// `claudeHook.ts`.

import {READ_STDIN_FN} from './hookStdin.js';
import {FORMAT_STATUS_LINE_FN} from './statusLineText.js';

/** Everything the generated status-line hook has to be told about this install. */
export interface HookScriptPaths {
    /** Shared registry of live widget endpoints. */
    registry: string;
    /** Directory of per-session caption files (`<id>.json` with `{place, task}`). */
    captions: string;
    /** Directory holding the extension's compiled GSettings schema. */
    schemaDir: string;
    schemaId: string;
    /** Boolean key that says whether anything is expected to listen. */
    collectorKey: string;
}

// The session's caption, written by whoever tracks what this session works on.
// Only the slot-owning shape of the hook renders a line at all, so only it
// carries this.
const READ_CAPTION_FN = `
// The session's caption, written by whoever tracks what this session works on.
// Absent, unreadable or malformed alike mean "no caption": a file owned by
// another program must cost the user a word in the line, not the line itself.
function readCaption(sessionId) {
    if (!sessionId)
        return {};
    try {
        const [ok, contents] = GLib.file_get_contents(
            GLib.build_filenamev([CAPTIONS, \`\${sessionId}.json\`]));
        if (!ok)
            return {};
        const data = JSON.parse(new TextDecoder().decode(contents));
        return data && typeof data === 'object' ? data : {};
    } catch (error) {
        return {};
    }
}
`;

// Port-independent hook. It renders the status line **itself**, from the payload
// Claude passes on stdin, and never prints anything the panel sent back: a
// disabled, crashed or not-yet-started widget used to leave the user with an
// empty status line, because the old hook printed the first widget's HTTP answer
// and had nothing to print without one.
//
// The panel is now an optional consumer of the same payload. The hook POSTs to
// the registered endpoints only while the `ai-collector` setting is on, and
// appends a red lamp (🚨) to the line when it is on but no endpoint accepted the
// payload (crashed shell, dead port, stale registry entry). Collection switched
// off means no POST and no lamp — a feature the user turned off is not a fault.
//
// Because the hook file content embeds no port/secret, multiple running widgets
// no longer overwrite each other's hook — they only add their endpoint to the
// registry.
//
// **Two shapes, one script.** Owning the slot means rendering the whole line;
// running as somebody's status-line segment (`{segment: true}`) means printing
// only what the panel itself knows — the lamp. A segment that also printed the
// model, the place and the percentages would print them twice, next to the
// segment whose data that is; delivery to the widget is identical either way,
// and delivery is the part the panel actually needs.
//
// The shebang MUST be `env -S gjs -m`: Claude Code invokes this file directly
// (honouring the shebang), and the body below uses ES module `import`
// statements, which are only valid in gjs's module mode (`-m`/`--module`); a
// bare `gjs` shebang runs the legacy import system and the script throws
// `SyntaxError: import declarations may only appear at top level of a module`
// on every invocation, silently dropping every sample (issue #6).
export function hookScriptText(paths: HookScriptPaths, {segment = false} = {}): string {
    return `#!/usr/bin/env -S gjs -m
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const REGISTRY = ${JSON.stringify(paths.registry)};
const CAPTIONS = ${JSON.stringify(paths.captions)};
const SCHEMA_DIR = ${JSON.stringify(paths.schemaDir)};
const SCHEMA_ID = ${JSON.stringify(paths.schemaId)};
const COLLECTOR_KEY = ${JSON.stringify(paths.collectorKey)};

${READ_STDIN_FN}

${segment ? '' : FORMAT_STATUS_LINE_FN}

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
${segment ? '' : READ_CAPTION_FN}
// Whether the panel is collecting at all. The ports registry cannot answer this:
// an entry survives a crashed GNOME Shell (deregistration happens on stop), so a
// stale one would light the lamp for a collector the user deliberately turned
// off.
function collectorExpected() {
    try {
        const source = Gio.SettingsSchemaSource.new_from_directory(
            SCHEMA_DIR, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(SCHEMA_ID, true);
        if (!schema || !schema.has_key(COLLECTOR_KEY))
            return false;
        return new Gio.Settings({settings_schema: schema}).get_boolean(COLLECTOR_KEY);
    } catch (error) {
        // The extension is gone or its settings are unreadable: nothing is
        // expected to listen, so nothing is reported as broken.
        return false;
    }
}

const stdin = readStdin();
let payload = {};
try {
    payload = JSON.parse(new TextDecoder().decode(stdin)) ?? {};
} catch (error) {
    // An unparseable payload still gets a (nearly empty) status line rather
    // than none: Claude shows exactly what this script prints.
    payload = {};
}

const expected = collectorExpected();
let delivered = false;
if (expected) {
    // A timeout, because this runs on Claude's status-line path: a widget that
    // accepts the connection and then hangs must not hang the status line.
    const session = new Soup.Session({timeout: 3});
    for (const endpoint of readEndpoints()) {
        const port = Number(endpoint && endpoint.port);
        if (!Number.isFinite(port) || port <= 0)
            continue;
        try {
            const message = Soup.Message.new('POST', \`http://127.0.0.1:\${port}/claude-statusline\`);
            message.request_headers.append('X-Gnome-Widget-Panel-Token', String(endpoint.secret ?? ''));
            message.set_request_body_from_bytes('application/json', GLib.Bytes.new(stdin));
            session.send_and_read(message, null);
            // Any 2xx counts: the usage graph answers 200, the status dot 204.
            const status = message.get_status();
            if (status >= 200 && status < 300)
                delivered = true;
        } catch (error) {
            // Skip an unreachable endpoint (stale registry entry).
        }
    }
}
${segment ? `
// A segment prints one thing or nothing at all: an empty line means "no segment
// here", and the dispatcher drops it together with its separator. Collection
// switched off means no lamp — a feature the user turned off is not a fault.
if (expected && !delivered)
    print('🚨');
` : `
const caption = readCaption(payload?.session_id);

print(formatClaudeStatusLine(payload, {
    place: caption.place,
    task: caption.task,
    lamp: expected && !delivered,
}));
`}`;
}

// Port-independent lifecycle-event hook (UserPromptSubmit / Stop / Notification
// / SessionEnd). Mirrors hookScriptText(): it reads the shared ports registry at
// run time and POSTs the raw Claude stdin payload to `/agent-event` on every
// registered endpoint. Unlike the status-line hook it must print NOTHING —
// Claude interprets a Stop hook's stdout — and always exit 0, quickly, so it
// never disturbs or blocks the Claude session it observes. See hookScriptText()
// for why the shebang must be `env -S gjs -m`.
export function eventHookScriptText(registry: string): string {
    return `#!/usr/bin/env -S gjs -m
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const REGISTRY = ${JSON.stringify(registry)};

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
