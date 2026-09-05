// @ts-nocheck
// @tag:ai-collector
//
// What the AI coding agents on this machine are doing, collected in one place
// and owned by the extension rather than by a widget.
//
// It used to be the other way round: `ai-agent-usage` opened a `Soup.Server`,
// installed Claude's hooks and spawned the Codex/Gemini helpers in its
// constructor, and `ai-agent-status` opened a second server on a second port for
// the same events. Collection was therefore a side effect of a widget existing —
// remove the widget and it stopped, edit the widget and it restarted. Worse, the
// two states it produced were indistinguishable on screen: "no sessions" and
// "nobody is collecting" drew the same empty dot.
//
// So the collector is the thing and the widgets are views of it. It runs while
// the `ai-collector` setting is on, whether or not an AI widget is configured,
// and a widget with no collector behind it says exactly that.
//
// What lives here is **raw event truth**: the latest payload per provider, the
// prompts that were sent, and the open sessions. What does *not* live here is
// policy — when a session stops counting as open, how long a payload stays
// fresh, how history is sampled — because those are display choices each widget
// configures separately. The collector only prunes at a fixed, generous horizon
// so its maps cannot grow without bound.
//
// See ../docs/implementation/ai-collector.md; the contracts are in
// `contracts.ts`.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {nowSeconds} from './colorUtils.js';
import * as ClaudeHook from './plugins/ai-agent-usage/claudeHook.js';
import {
    claudePromptRequest,
    normalizeClaudeStatusLine,
} from './plugins/ai-agent-usage/claudeStatusLine.js';

// What an AI widget says while nothing is collecting. One owner for the wording,
// because both AI widgets show it and it names a specific setting — two copies
// would drift the moment that setting is renamed or moved. Plain text: the
// widgets render their tooltips as Pango markup.
export const COLLECTOR_OFF_TEXT =
    'AI collector is off.\nTurn it on in the panel settings to collect agent activity.';

// Nothing is kept longer than this. It is a memory bound, not a display policy:
// every widget applies its own, shorter window on top (the status widget's
// "expire after N minutes", the usage graph's visible request window).
const PRUNE_AFTER_SECONDS = 24 * 3600;

// Claude Code lifecycle events, mapped to the state they put a session in.
// `statusline-activity` is not an event Claude sends — it is the status line
// firing, which only happens while the agent is generating.
const EVENT_STATES = {
    UserPromptSubmit: 'thinking',
    'statusline-activity': 'thinking',
    Notification: 'waiting',
    Stop: 'idle',
};


function decodeBody(msg) {
    return new TextDecoder().decode(msg.get_request_body().flatten().get_data());
}


// Session display name: the working directory's basename, falling back to a
// short session-id prefix.
function sessionLabel(cwd, id) {
    const dir = typeof cwd === 'string' ? cwd.replace(/\/+$/, '') : '';
    if (dir) {
        const base = dir.split('/').filter(Boolean).pop();
        if (base)
            return base;
    }
    return String(id).slice(0, 8);
}


// Defensive extraction of `{session_id, cwd}` from a hook or statusLine payload
// (the statusLine payload keeps cwd under workspace.current_dir).
function extractSession(payload) {
    const id = typeof payload?.session_id === 'string' && payload.session_id
        ? payload.session_id
        : null;
    let cwd = null;
    for (const candidate of [payload?.cwd, payload?.workspace?.current_dir]) {
        if (typeof candidate === 'string' && candidate) {
            cwd = candidate;
            break;
        }
    }
    return {id, cwd};
}


export class AiCollector {
    constructor(extensionPath, settings) {
        this._extensionPath = extensionPath;
        this._settings = settings;

        this._running = false;
        this._server = null;
        this._port = 0;
        this._secret = null;
        this._registered = false;
        this._helpers = new Map();

        // The collected world.
        this._providers = new Map();
        this._requests = [];
        this._requestKeys = new Set();
        this._sessions = new Map();

        this._listeners = new Map();
        this._nextListener = 1;

        // Every key that changes what is collected restarts the collector. It is
        // a cheap operation (one socket, up to two child processes) and far
        // simpler than diffing which half of it needs restarting.
        this._settingsIds = [
            'ai-collector',
            'ai-collector-port',
            'ai-collector-claude',
            'ai-collector-codex',
            'ai-collector-gemini',
        ].map((key) =>
            this._settings.connect(`changed::${key}`, () => this._applySettings())
        );

        this._applySettings();
    }

    // --- what the widgets see ---------------------------------------------

    get running() {
        return this._running;
    }

    get providers() {
        return this._providers;
    }

    get requests() {
        return this._requests;
    }

    get sessions() {
        return this._sessions;
    }

    addListener(listener) {
        const token = this._nextListener++;
        this._listeners.set(token, listener);
        return token;
    }

    removeListener(token) {
        this._listeners.delete(token);
    }

    // One listener throwing must not stop the others from being told.
    _notify() {
        for (const listener of this._listeners.values()) {
            try {
                listener();
            } catch (error) {
                logError(error, 'widget-panel: AI collector listener failed');
            }
        }
    }

    // --- lifecycle ----------------------------------------------------------

    _enabled(key) {
        try {
            return this._settings.get_boolean(key);
        } catch (_e) {
            // A stale schema without the key: collecting is the default.
            return true;
        }
    }

    _configuredPort() {
        try {
            const port = this._settings.get_int('ai-collector-port');
            if (port >= 1024 && port <= 65535)
                return port;
        } catch (_e) {
            // fall through to the schema default below
        }
        return 17861;
    }

    _applySettings() {
        this.stop();
        if (this._enabled('ai-collector'))
            this.start();
        this._notify();
    }

    start() {
        if (this._running)
            return;
        this._running = true;
        if (this._enabled('ai-collector-claude'))
            this._startClaude();
        if (this._enabled('ai-collector-codex'))
            this._startHelper('codex', 'codex-usage-helper.gjs');
        if (this._enabled('ai-collector-gemini'))
            this._startHelper('gemini', 'gemini-usage-helper.gjs');
    }

    stop() {
        if (!this._running)
            return;
        this._running = false;
        this._stopClaude();
        for (const name of [...this._helpers.keys()])
            this._stopHelper(name);
        // The data stays: turning collection off should not erase what a widget
        // is showing mid-glance, and turning it back on continues the picture.
    }

    destroy() {
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this._listeners.clear();
        this.stop();
    }

    // --- Claude: one localhost server, fed by the hooks ---------------------

    async _startClaude() {
        if (!ClaudeHook.isClaudeInstalled())
            return;
        this._port = this._configuredPort();
        this._secret = GLib.uuid_string_random();
        try {
            this._server = new Soup.Server();
            this._server.add_handler('/claude-statusline', (server, msg) =>
                this._handleStatusLine(msg)
            );
            this._server.add_handler('/agent-event', (server, msg) =>
                this._handleAgentEvent(msg)
            );
            this._server.listen_local(this._port, Soup.ServerListenOptions.IPV4_ONLY);
            await ClaudeHook.installHook();
            await ClaudeHook.installEventHooks();
            await ClaudeHook.registerPort(this._port, this._secret);
            // The collector may have been stopped while the hook I/O was in
            // flight; undo the registration rather than leave a stale endpoint
            // that the hook would keep posting to.
            if (!this._running) {
                ClaudeHook.deregisterPort(this._port).catch(() => {});
                this._closeServer();
                return;
            }
            this._registered = true;
        } catch (error) {
            logError(error, 'widget-panel: AI collector Claude hook failed');
            this._stopClaude();
        }
    }

    _stopClaude() {
        if (this._registered) {
            // Best-effort, fire-and-forget: stop() is called from destroy(),
            // which cannot await.
            ClaudeHook.deregisterPort(this._port).catch((error) =>
                logError(error, 'widget-panel: AI collector deregister failed')
            );
            this._registered = false;
        }
        this._closeServer();
    }

    _closeServer() {
        if (this._server) {
            this._server.disconnect();
            this._server = null;
        }
    }

    // Shared request validation: POST, right secret, non-empty body. It answers
    // the message itself in every case it rejects and returns null; a caller
    // that gets null is done with the message.
    //
    // An empty body is answered 200, not an error: some lifecycle events carry
    // nothing useful, and the hook reads the status code as "did the collector
    // take it". There is one server now, so every accepted request answers 200 —
    // the old two-server arrangement needed the status widget to answer 204 so
    // its empty body could not hijack Claude's status line from the usage
    // widget, and that hazard is gone with the second server.
    _readRequest(msg) {
        if (msg.get_method() !== 'POST') {
            msg.set_status(Soup.Status.METHOD_NOT_ALLOWED, null);
            return null;
        }
        // Soup.ServerMessage (unlike the client-side Soup.Message the hook
        // scripts use) has no `request-headers` GObject property, only the
        // `get_request_headers()` method — reading `msg.request_headers` is
        // always undefined and throws on `.get_one`, which rejected every
        // request before it was checked (issue #6).
        const token = msg.get_request_headers().get_one('X-Gnome-Widget-Panel-Token');
        if (token !== this._secret) {
            msg.set_status(Soup.Status.FORBIDDEN, null);
            return null;
        }
        const text = decodeBody(msg);
        if (!text.trim()) {
            msg.set_status(Soup.Status.OK, null);
            return null;
        }
        return JSON.parse(text);
    }

    // Claude's status line. Two things arrive on it: the usage payload the graph
    // draws, and the fact that the agent is generating right now, which the
    // session dot reads as activity.
    //
    // Answers 200 with no body. The hook prints the status line itself from its
    // own stdin and reads nothing but the status code, which tells it whether
    // the payload was accepted.
    _handleStatusLine(msg) {
        try {
            const payload = this._readRequest(msg);
            if (payload === null)
                return;

            const value = normalizeClaudeStatusLine(payload);
            // Freshness: without it every consumer treats Claude as stale and
            // skips it, so its columns never draw. The helpers below stamp the
            // same field on every line they emit.
            value.updated_monotonic = nowSeconds();
            this._providers.set('claude', value);
            this._ingestRequests(value);

            const {id, cwd} = extractSession(payload);
            if (id)
                this._applyEvent('statusline-activity', id, cwd);

            msg.set_status(Soup.Status.OK, null);
            this._notify();
        } catch (error) {
            logError(error, 'widget-panel: AI collector status line failed');
            msg.set_status(Soup.Status.BAD_REQUEST, null);
        }
    }

    // UserPromptSubmit / Stop / Notification / SessionEnd. The prompt text only
    // comes with UserPromptSubmit — the status-line payload carries none — so
    // this is also where the graph's request markers come from (issue #6).
    _handleAgentEvent(msg) {
        try {
            const payload = this._readRequest(msg);
            if (payload === null)
                return;

            const {id, cwd} = extractSession(payload);
            if (id)
                this._applyEvent(String(payload?.hook_event_name ?? ''), id, cwd);

            const request = claudePromptRequest(payload);
            if (request)
                this._ingestRequests({provider: 'claude', requests: [request]});

            msg.set_status(Soup.Status.OK, null);
            this._notify();
        } catch (error) {
            logError(error, 'widget-panel: AI collector agent event failed');
            msg.set_status(Soup.Status.BAD_REQUEST, null);
        }
    }

    // --- Codex / Gemini: a child process streaming JSON Lines ---------------

    _startHelper(name, script) {
        const path = GLib.build_filenamev([
            this._extensionPath,
            'plugins',
            'ai-agent-usage',
            'helpers',
            script,
        ]);
        if (!GLib.file_test(path, GLib.FileTest.EXISTS))
            return;
        try {
            const process = Gio.Subprocess.new(
                ['gjs', '-m', path],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            const helper = {
                process,
                cancellable: new Gio.Cancellable(),
                stdout: new Gio.DataInputStream({
                    base_stream: process.get_stdout_pipe(),
                }),
            };
            this._helpers.set(name, helper);
            this._readHelperLine(name);
        } catch (error) {
            logError(error, `widget-panel: AI collector ${name} helper failed`);
            this._stopHelper(name);
        }
    }

    _readHelperLine(name) {
        const helper = this._helpers.get(name);
        if (!helper?.stdout)
            return;
        helper.stdout.read_line_async(
            GLib.PRIORITY_DEFAULT,
            helper.cancellable,
            (stream, result) => {
                if (this._helpers.get(name) !== helper)
                    return;
                try {
                    const [line] = stream.read_line_finish_utf8(result);
                    if (line === null)
                        return;
                    const value = JSON.parse(line);
                    value.updated_monotonic = nowSeconds();
                    this._providers.set(name, value);
                    this._ingestRequests(value);
                    this._notify();
                    this._readHelperLine(name);
                } catch (error) {
                    if (!helper.cancellable?.is_cancelled())
                        logError(error, `widget-panel: AI collector ${name} read failed`);
                }
            }
        );
    }

    _stopHelper(name) {
        const helper = this._helpers.get(name);
        if (!helper)
            return;
        this._helpers.delete(name);
        helper.cancellable?.cancel();
        helper.process?.force_exit();
    }

    // --- collected state ----------------------------------------------------

    // Record the prompts on a provider payload, ignoring ones already seen: the
    // helpers re-emit their newest event on every read, and the same prompt must
    // not become two markers.
    _ingestRequests(value) {
        if (!Array.isArray(value?.requests))
            return;
        const provider = value.provider ?? 'unknown';
        for (const request of value.requests) {
            const parsed = Date.parse(request?.timestamp);
            if (!Number.isFinite(parsed))
                continue;
            const ts = Math.floor(parsed / 1000);
            const text = String(request?.text ?? '').replace(/\s+/g, ' ').trim();
            if (!text)
                continue;
            const key = `${provider}:${ts}:${text.slice(0, 40)}`;
            if (this._requestKeys.has(key))
                continue;
            this._requestKeys.add(key);
            this._requests.push({ts, text, provider});
        }
        this._prune();
    }

    // Event -> session state. `waiting` has the highest priority: background
    // status-line activity must not demote it — only an explicit
    // UserPromptSubmit (the user answered) or Stop/SessionEnd moves it on.
    _applyEvent(eventName, id, cwd) {
        const now = nowSeconds();
        if (eventName === 'SessionEnd') {
            if (this._sessions.delete(id))
                this._notify();
            return;
        }
        const state = EVENT_STATES[eventName];
        if (!state)
            return;

        let session = this._sessions.get(id);
        if (eventName === 'statusline-activity' && session?.state === 'waiting') {
            session.lastEvent = now;
            return;
        }
        if (!session) {
            this._sessions.set(id, {
                id,
                cwd: cwd ?? null,
                label: sessionLabel(cwd, id),
                provider: 'claude',
                state,
                lastEvent: now,
                lastChange: now,
            });
        } else {
            if (cwd) {
                session.cwd = cwd;
                session.label = sessionLabel(cwd, id);
            }
            session.lastEvent = now;
            if (session.state !== state) {
                session.state = state;
                session.lastChange = now;
            }
        }
        this._prune();
    }

    // The memory bound. Every widget applies its own, shorter window on top.
    _prune() {
        const oldest = nowSeconds() - PRUNE_AFTER_SECONDS;
        if (this._requests.length && this._requests[0].ts < oldest) {
            this._requests = this._requests.filter((item) => item.ts >= oldest);
            this._requestKeys = new Set(
                this._requests.map(
                    (item) => `${item.provider}:${item.ts}:${item.text.slice(0, 40)}`
                )
            );
        }
        for (const [id, session] of this._sessions) {
            if (session.lastEvent < oldest)
                this._sessions.delete(id);
        }
    }
}
