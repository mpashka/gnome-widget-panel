// @ts-nocheck
'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
const WIDTH = 54;
const HEIGHT = 16;
const HISTORY_WIDTH = 36;
const SAMPLE_INTERVAL_SECONDS = 5;
const STALE_AFTER_SECONDS = 120;
const DEFAULT_CLAUDE_PORT = 17861;
const HOOK_NAME = 'gnome-widget-panel-claude-hook.js';
function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}
function decodeBytes(bytes) {
    return new TextDecoder().decode(bytes);
}
function atomicWrite(path, contents, mode = 0o600) {
    const file = Gio.File.new_for_path(path);
    file.replace_contents(new TextEncoder().encode(contents), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    try {
        GLib.chmod(path, mode);
    }
    catch (error) {
        console.error(`GNOME Widget Panel AI usage chmod failed: ${error}`);
    }
}
function parseTokens(value) {
    const tokens = value?.tokens ?? {};
    return Number(tokens.total ?? 0);
}
function parseContext(value) {
    const context = value?.context ?? {};
    if (Number.isFinite(Number(context.used_percent)))
        return Math.clamp(Number(context.used_percent) / 100, 0, 1);
    const total = parseTokens(value);
    const windowTokens = Number(context.window_tokens ?? 0);
    if (windowTokens > 0)
        return Math.clamp(total / windowTokens, 0, 1);
    return 0;
}
function parseLimit(value) {
    const limits = value?.limits ?? {};
    const values = [];
    for (const name of ['primary', 'secondary']) {
        const limit = limits[name];
        if (limit && Number.isFinite(Number(limit.used_percent)))
            values.push(Math.clamp(Number(limit.used_percent) / 100, 0, 1));
    }
    return values.length ? Math.max(...values) : 0;
}
function normalizeClaudeStatusLine(data) {
    const context = data?.context_window ?? {};
    const usage = context.current_usage ?? {};
    const tokens = {
        input: Number(usage.input_tokens ?? 0),
        output: Number(usage.output_tokens ?? 0),
        cache_creation: Number(usage.cache_creation_input_tokens ?? 0),
        cache_read: Number(usage.cache_read_input_tokens ?? 0),
    };
    tokens.total = Object.values(tokens)
        .filter(Number.isFinite)
        .reduce((sum, value) => sum + value, 0);
    return {
        provider: 'claude',
        updated_at: new Date().toISOString(),
        updated_monotonic: nowSeconds(),
        model: data?.model?.id ?? null,
        tokens,
        context: {
            used_percent: Number(context.used_percentage ?? 0),
            window_tokens: Number(context.context_window_size ?? 0),
        },
    };
}
function formatStatusLine(value) {
    const tokens = parseTokens(value);
    const context = Math.round(parseContext(value) * 100);
    return `Claude ${tokens} tok ctx:${context}%`;
}
export const AiAgentUsageGraph = GObject.registerClass(class AiAgentUsageGraph extends St.DrawingArea {
    constructor(extensionPath, options = {}) {
        super({
            style_class: 'ai-agent-usage-graph',
            width: Number(options.width ?? WIDTH),
            height: Number(options.height ?? HEIGHT),
            reactive: false,
        });
        this._extensionPath = extensionPath;
        this._claudePort = Number(options.claudePort ?? DEFAULT_CLAUDE_PORT);
        this._enableClaude = options.enableClaude ?? true;
        this._enableCodex = options.enableCodex ?? true;
        this._providers = new Map();
        this._samples = Array(HISTORY_WIDTH).fill({
            tokens: 0,
            context: 0,
            limit: 0,
        });
        this._maxTokens = 1;
        this._claudeSecret = GLib.uuid_string_random();
        this._server = null;
        this._codexProcess = null;
        this._codexStdout = null;
        this._codexReadCancellable = null;
        this._sampleTimeoutId = null;
        this._repaintId = this.connect('repaint', () => this._draw());
        if (this._enableClaude)
            this._startClaudeHttpHook();
        if (this._enableCodex)
            this._startCodexHelper();
        this._sampleTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SAMPLE_INTERVAL_SECONDS, () => {
            this._sample();
            return GLib.SOURCE_CONTINUE;
        });
    }
    _isClaudeAvailable() {
        return GLib.file_test(GLib.build_filenamev([GLib.get_home_dir(), '.claude']), GLib.FileTest.IS_DIR);
    }
    _startClaudeHttpHook() {
        if (!this._isClaudeAvailable())
            return;
        try {
            this._server = new Soup.Server();
            this._server.add_handler('/claude-statusline', (server, msg) => {
                this._handleClaudeRequest(msg);
            });
            this._server.listen_local(this._claudePort, Soup.ServerListenOptions.IPV4_ONLY);
            this._installClaudeHook();
        }
        catch (error) {
            console.error(`GNOME Widget Panel Claude hook failed: ${error}`);
            this._stopClaudeHttpHook();
        }
    }
    _handleClaudeRequest(msg) {
        try {
            if (msg.get_method() !== 'POST') {
                msg.set_status(Soup.Status.METHOD_NOT_ALLOWED, null);
                return;
            }
            const token = msg.request_headers.get_one('X-Gnome-Widget-Panel-Token');
            if (token !== this._claudeSecret) {
                msg.set_status(Soup.Status.FORBIDDEN, null);
                return;
            }
            const body = msg.get_request_body().flatten().get_data();
            const payload = JSON.parse(decodeBytes(body));
            const value = normalizeClaudeStatusLine(payload);
            this._providers.set('claude', value);
            this.queue_repaint();
            msg.set_status(Soup.Status.OK, null);
            msg.set_response('text/plain', Soup.MemoryUse.COPY, new TextEncoder().encode(formatStatusLine(value)));
        }
        catch (error) {
            console.error(`GNOME Widget Panel Claude request failed: ${error}`);
            msg.set_status(Soup.Status.BAD_REQUEST, null);
        }
    }
    _installClaudeHook() {
        const configDir = GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
        GLib.mkdir_with_parents(configDir, 0o700);
        const hookPath = GLib.build_filenamev([configDir, HOOK_NAME]);
        const settingsPath = GLib.build_filenamev([configDir, 'settings.json']);
        const hook = `#!/usr/bin/env gjs
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const PORT = ${JSON.stringify(this._claudePort)};
const SECRET = ${JSON.stringify(this._claudeSecret)};

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
        atomicWrite(hookPath, hook, 0o700);
        let settings = {};
        if (GLib.file_test(settingsPath, GLib.FileTest.EXISTS)) {
            try {
                const [ok, contents] = GLib.file_get_contents(settingsPath);
                if (ok)
                    settings = JSON.parse(decodeBytes(contents));
            }
            catch (error) {
                console.error(`GNOME Widget Panel cannot parse Claude settings: ${error}`);
                return;
            }
        }
        settings.statusLine = {
            type: 'command',
            command: hookPath,
        };
        atomicWrite(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 0o600);
    }
    _stopClaudeHttpHook() {
        if (this._server) {
            this._server.disconnect();
            this._server = null;
        }
    }
    _startCodexHelper() {
        const helperPath = GLib.build_filenamev([
            this._extensionPath,
            'plugins',
            'ai-agent-usage',
            'helpers',
            'codex-usage-helper.js',
        ]);
        if (!GLib.file_test(helperPath, GLib.FileTest.EXISTS))
            return;
        try {
            this._codexProcess = Gio.Subprocess.new(['gjs', '-m', helperPath], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            this._codexReadCancellable = new Gio.Cancellable();
            this._codexStdout = new Gio.DataInputStream({
                base_stream: this._codexProcess.get_stdout_pipe(),
            });
            this._readCodexLine();
        }
        catch (error) {
            console.error(`GNOME Widget Panel Codex helper failed: ${error}`);
            this._stopCodexHelper();
        }
    }
    _readCodexLine() {
        if (!this._codexStdout)
            return;
        this._codexStdout.read_line_async(GLib.PRIORITY_DEFAULT, this._codexReadCancellable, (stream, result) => {
            try {
                const [line] = stream.read_line_finish_utf8(result);
                if (line !== null) {
                    const value = JSON.parse(line);
                    value.updated_monotonic = nowSeconds();
                    this._providers.set('codex', value);
                    this.queue_repaint();
                    this._readCodexLine();
                }
            }
            catch (error) {
                if (!this._codexReadCancellable?.is_cancelled())
                    console.error(`GNOME Widget Panel Codex read failed: ${error}`);
            }
        });
    }
    _stopCodexHelper() {
        if (this._codexReadCancellable) {
            this._codexReadCancellable.cancel();
            this._codexReadCancellable = null;
        }
        this._codexStdout = null;
        if (this._codexProcess) {
            this._codexProcess.force_exit();
            this._codexProcess = null;
        }
    }
    _currentProvider() {
        const freshAfter = nowSeconds() - STALE_AFTER_SECONDS;
        let best = null;
        for (const value of this._providers.values()) {
            if ((value.updated_monotonic ?? 0) < freshAfter)
                continue;
            if (!best || parseTokens(value) > parseTokens(best))
                best = value;
        }
        return best;
    }
    _sample() {
        const value = this._currentProvider();
        const sample = value
            ? {
                tokens: parseTokens(value),
                context: parseContext(value),
                limit: parseLimit(value),
            }
            : { tokens: 0, context: 0, limit: 0 };
        this._samples.push(sample);
        this._samples.shift();
        this._maxTokens = Math.max(1, ...this._samples.map(item => item.tokens));
        this.queue_repaint();
    }
    _draw() {
        const context = this.get_context();
        const [width, height] = this.get_surface_size();
        const themeNode = this.get_theme_node();
        const color = themeNode.get_foreground_color();
        context.setLineWidth(1);
        context.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, 0.9);
        context.moveTo(0, height);
        for (let x = 0; x < HISTORY_WIDTH; x++) {
            const value = this._samples[x].tokens / this._maxTokens;
            context.lineTo(x, height - value * (height - 1));
        }
        context.lineTo(HISTORY_WIDTH, height);
        context.closePath();
        context.fill();
        const current = this._samples[this._samples.length - 1];
        const bars = [
            { value: current.context, color: [0.30, 0.65, 1.0, 0.95] },
            { value: current.limit, color: [1.0, 0.72, 0.18, 0.95] },
        ];
        let x = Math.max(HISTORY_WIDTH + 4, width - 10);
        for (const bar of bars) {
            const barHeight = Math.round(bar.value * height);
            context.setSourceRGBA(...bar.color);
            context.rectangle(x, height - barHeight, 3, barHeight);
            context.fill();
            context.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, 0.35);
            context.rectangle(x, 0, 3, height);
            context.stroke();
            x += 5;
        }
        context.$dispose();
    }
    destroy() {
        if (this._sampleTimeoutId) {
            GLib.Source.remove(this._sampleTimeoutId);
            this._sampleTimeoutId = null;
        }
        if (this._repaintId) {
            this.disconnect(this._repaintId);
            this._repaintId = null;
        }
        this._stopCodexHelper();
        this._stopClaudeHttpHook();
        super.destroy();
    }
});
