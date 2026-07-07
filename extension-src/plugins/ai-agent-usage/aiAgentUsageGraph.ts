// @ts-nocheck
'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as ClaudeHook from './claudeHook.js';

const WIDTH = 54;
const HEIGHT = 16;
const HISTORY_WIDTH = 36;
const SCALE_HISTORY_WIDTH = HISTORY_WIDTH * 2;
const DEFAULT_MIN_ACTIVE_TOKENS = 10_000;
const SAMPLE_INTERVAL_SECONDS = 5;
const TOKEN_EVENT_ACTIVE_SECONDS = SAMPLE_INTERVAL_SECONDS * 3;
const STALE_AFTER_SECONDS = 120;
const DEFAULT_CLAUDE_PORT = 17861;
const TOOLTIP_OFFSET = 6;
const TOOLTIP_ANIMATION_TIME = 150;
// Seconds of history visible in the graph body (one column per sample).
const REQUEST_WINDOW_SECONDS = HISTORY_WIDTH * SAMPLE_INTERVAL_SECONDS;
const REQUEST_TEXT_PREVIEW = 30;
const REQUEST_COLOR = [0.90, 0.15, 0.15, 0.9];
// Indicator colours, shared by the vertical bars and the matching tooltip
// icons: usage = rate-limit bar + usage cup; window = context bar + reset icon.
const DEFAULT_USAGE_COLOR = '#ffb82e';
const DEFAULT_WINDOW_COLOR = '#4ca6ff';
// Per-provider graph colours (brand palette): OpenAI/Codex teal, Anthropic/Claude clay.
const DEFAULT_CODEX_COLOR = '#10a37f';
const DEFAULT_CLAUDE_COLOR = '#d97757';
// Fill-level "cup" glyphs (empty → full): ○ ◔ ◑ ◕ ●
const CUP_LEVELS = ['○', '◔', '◑', '◕', '●'];
// Hourglass, for the limit-window reset time.
const WINDOW_GLYPH = '⧗';

function hexToRgb(hex) {
    const raw = String(hex).replace('#', '');
    const full = raw.length === 3
        ? raw.split('').map(c => c + c).join('')
        : raw;
    const channel = start => {
        const value = parseInt(full.slice(start, start + 2), 16) / 255;
        return Number.isFinite(value) ? value : 0;
    };
    return [channel(0), channel(2), channel(4)];
}

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function formatClock(tsSeconds) {
    const date = new Date(tsSeconds * 1000);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function decodeBytes(bytes) {
    return new TextDecoder().decode(bytes);
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

function formatPercent(value) {
    return `${Math.round(Math.clamp(Number(value ?? 0), 0, 1) * 100)}%`;
}

function formatTokenCount(value) {
    const tokens = Number(value ?? 0);
    if (!Number.isFinite(tokens))
        return '0';
    if (tokens >= 1_000_000)
        return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000)
        return `${Math.round(tokens / 100) / 10}k`;
    return `${Math.round(tokens)}`;
}

function activeTokens(tokens, minimumTokens) {
    tokens = Number(tokens ?? 0);
    if (!Number.isFinite(tokens) || tokens < minimumTokens)
        return 0;
    return tokens;
}

function eventAgeSeconds(value) {
    if (!value?.event_timestamp)
        return 0;
    const timestamp = Date.parse(value.event_timestamp);
    if (!Number.isFinite(timestamp))
        return 0;
    return Math.max(0, nowSeconds() - Math.floor(timestamp / 1000));
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

function escapeMarkup(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function providerLabel(name) {
    if (!name)
        return 'none';
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function usageCup(percent) {
    const index = percent < 10 ? 0
        : percent < 35 ? 1
        : percent < 60 ? 2
        : percent < 85 ? 3
        : 4;
    return CUP_LEVELS[index];
}

// The rate-limit window with the highest usage, plus when it resets.
function bestLimit(value) {
    const limits = value?.limits ?? {};
    let best = null;
    for (const name of ['primary', 'secondary']) {
        const limit = limits[name];
        if (limit && Number.isFinite(Number(limit.used_percent))) {
            const percent = Number(limit.used_percent);
            if (!best || percent > best.percent)
                best = {percent, resetsAt: Number(limit.resets_at)};
        }
    }
    return best;
}

function formatResetTime(epochSeconds) {
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0)
        return '?';
    const delta = epochSeconds - Date.now() / 1000;
    if (delta <= 0)
        return 'now';
    if (delta < 86400) {
        const date = new Date(epochSeconds * 1000);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    return `${Math.round(delta / 86400)}d`;
}

export const AiAgentUsageGraph = GObject.registerClass(
    class AiAgentUsageGraph extends St.DrawingArea {
        constructor(extensionPath, options = {}) {
            super({
                style_class: 'ai-agent-usage-graph',
                width: Number(options.width ?? WIDTH),
                height: Number(options.height ?? HEIGHT),
                reactive: true,
                track_hover: true,
            });

            this._extensionPath = extensionPath;
            this._claudePort = Number(options.claudePort ?? DEFAULT_CLAUDE_PORT);
            this._enableClaude = options.enableClaude ?? true;
            this._enableCodex = options.enableCodex ?? true;
            this._minActiveTokens = Number(options.minActiveTokens);
            if (!Number.isFinite(this._minActiveTokens) || this._minActiveTokens < 0)
                this._minActiveTokens = DEFAULT_MIN_ACTIVE_TOKENS;
            // Colours: indicator bars/icons and per-provider graph colours.
            this._usageColor = options.usageColor || DEFAULT_USAGE_COLOR;
            this._windowColor = options.windowColor || DEFAULT_WINDOW_COLOR;
            this._codexColor = options.codexColor || DEFAULT_CODEX_COLOR;
            this._claudeColor = options.claudeColor || DEFAULT_CLAUDE_COLOR;
            this._requestPreview = Number(options.requestPreview) > 0
                ? Number(options.requestPreview)
                : REQUEST_TEXT_PREVIEW;
            this._showRequests = options.showRequests !== false;
            this._providers = new Map();
            this._sampledEventIds = new Set();
            this._requests = [];
            this._requestKeys = new Set();
            this._samples = Array(SCALE_HISTORY_WIDTH).fill({
                tokens: 0,
                context: 0,
                limit: 0,
                provider: null,
            });
            this._maxTokens = 1;
            // Prefer a persisted secret (written by the Configure button in
            // preferences) so the hook and this server agree after a reload.
            this._claudeSecret = options.claudeSecret || GLib.uuid_string_random();
            this._server = null;
            this._codexProcess = null;
            this._codexStdout = null;
            this._codexReadCancellable = null;
            this._sampleTimeoutId = null;
            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            this._tooltip.clutter_text.line_alignment = Pango.Alignment.LEFT;
            Main.uiGroup.add_child(this._tooltip);
            this._repaintId = this.connect('repaint', () => this._draw());
            this._hoverId = this.connect('notify::hover', () => this._onHoverChanged());

            if (this._enableClaude)
                this._startClaudeHttpHook();
            if (this._enableCodex)
                this._startCodexHelper();

            this._sampleTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                SAMPLE_INTERVAL_SECONDS,
                () => {
                    this._sample();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        _startClaudeHttpHook() {
            if (!ClaudeHook.isClaudeInstalled())
                return;

            try {
                this._server = new Soup.Server();
                this._server.add_handler('/claude-statusline', (server, msg) => {
                    this._handleClaudeRequest(msg);
                });
                this._server.listen_local(
                    this._claudePort,
                    Soup.ServerListenOptions.IPV4_ONLY
                );
                ClaudeHook.installHook(this._claudePort, this._claudeSecret);
            } catch (error) {
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
                this._ingestRequests(value);
                this.queue_repaint();

                msg.set_status(Soup.Status.OK, null);
                msg.set_response(
                    'text/plain',
                    Soup.MemoryUse.COPY,
                    new TextEncoder().encode(formatStatusLine(value))
                );
            } catch (error) {
                console.error(`GNOME Widget Panel Claude request failed: ${error}`);
                msg.set_status(Soup.Status.BAD_REQUEST, null);
            }
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
                this._codexProcess = Gio.Subprocess.new(
                    ['gjs', '-m', helperPath],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
                );
                this._codexReadCancellable = new Gio.Cancellable();
                this._codexStdout = new Gio.DataInputStream({
                    base_stream: this._codexProcess.get_stdout_pipe(),
                });
                this._readCodexLine();
            } catch (error) {
                console.error(`GNOME Widget Panel Codex helper failed: ${error}`);
                this._stopCodexHelper();
            }
        }

        _readCodexLine() {
            if (!this._codexStdout)
                return;
            this._codexStdout.read_line_async(
                GLib.PRIORITY_DEFAULT,
                this._codexReadCancellable,
                (stream, result) => {
                    try {
                        const [line] = stream.read_line_finish_utf8(result);
                        if (line !== null) {
                            const value = JSON.parse(line);
                            value.updated_monotonic = nowSeconds();
                            this._providers.set('codex', value);
                            this._ingestRequests(value);
                            this.queue_repaint();
                            this._readCodexLine();
                        }
                    } catch (error) {
                        if (!this._codexReadCancellable?.is_cancelled())
                            console.error(`GNOME Widget Panel Codex read failed: ${error}`);
                    }
                }
            );
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

        _ingestRequests(value) {
            if (!Array.isArray(value?.requests))
                return;
            const provider = value.provider ?? 'unknown';
            for (const request of value.requests) {
                const parsed = Date.parse(request?.timestamp);
                if (!Number.isFinite(parsed))
                    continue;
                const tsSeconds = Math.floor(parsed / 1000);
                const text = String(request?.text ?? '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (!text)
                    continue;
                const key = `${provider}:${tsSeconds}:${text.slice(0, 40)}`;
                if (this._requestKeys.has(key))
                    continue;
                this._requestKeys.add(key);
                this._requests.push({ts: tsSeconds, text, provider});
            }
            this._pruneRequests();
        }

        _pruneRequests() {
            const oldest = nowSeconds() - REQUEST_WINDOW_SECONDS * 2;
            this._requests = this._requests.filter(item => item.ts >= oldest);
            this._requestKeys = new Set(
                this._requests.map(
                    item => `${item.provider}:${item.ts}:${item.text.slice(0, 40)}`
                )
            );
        }

        _visibleRequests() {
            const now = nowSeconds();
            const oldest = now - REQUEST_WINDOW_SECONDS;
            return this._requests
                .filter(item => item.ts >= oldest && item.ts <= now)
                .sort((a, b) => a.ts - b.ts);
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

        _tokensForSampling(value) {
            if (!value)
                return 0;

            if (value.event_id) {
                if (this._sampledEventIds.has(value.event_id))
                    return 0;
                if (eventAgeSeconds(value) > TOKEN_EVENT_ACTIVE_SECONDS)
                    return 0;
            }

            return parseTokens(value);
        }

        _currentTokenProvider() {
            const freshAfter = nowSeconds() - STALE_AFTER_SECONDS;
            let best = null;
            let bestTokens = 0;
            for (const value of this._providers.values()) {
                if ((value.updated_monotonic ?? 0) < freshAfter)
                    continue;
                const tokens = this._tokensForSampling(value);
                if (tokens > bestTokens) {
                    best = value;
                    bestTokens = tokens;
                }
            }
            return best;
        }

        _providerHex(name) {
            if (name === 'codex')
                return this._codexColor;
            if (name === 'claude')
                return this._claudeColor;
            return null;
        }

        _sample() {
            const tokenValue = this._currentTokenProvider();
            const statusValue = tokenValue ?? this._currentProvider();
            const sample = statusValue
                ? {
                    tokens: tokenValue ? parseTokens(tokenValue) : 0,
                    context: parseContext(statusValue),
                    limit: parseLimit(statusValue),
                    provider: tokenValue?.provider ?? statusValue?.provider ?? null,
                }
                : {tokens: 0, context: 0, limit: 0, provider: null};
            if (tokenValue?.event_id)
                this._sampledEventIds.add(tokenValue.event_id);
            this._samples.push(sample);
            this._samples.shift();
            this._maxTokens = Math.max(
                1,
                ...this._samples.map(item =>
                    activeTokens(item.tokens, this._minActiveTokens)
                )
            );
            if (this.hover)
                this._updateTooltip();
            this.queue_repaint();
        }

        _tooltipMarkup() {
            const provider = this._currentProvider();
            if (!provider)
                return 'AI tokens: none';

            const providerHex = this._providerHex(provider.provider);
            const label = escapeMarkup(providerLabel(provider.provider));
            const name = providerHex
                ? `<span foreground="${providerHex}">${label}</span>`
                : label;

            // Usage cup (usage-bar colour): prefer the rate limit; fall back to
            // context-window use. Reset icon uses the window-bar colour.
            const limit = bestLimit(provider);
            let percent;
            let resetPart = '';
            if (limit) {
                percent = Math.round(limit.percent);
                if (Number.isFinite(limit.resetsAt) && limit.resetsAt > 0)
                    resetPart = ` <span foreground="${this._windowColor}">${WINDOW_GLYPH}</span> ${formatResetTime(limit.resetsAt)}`;
            } else {
                percent = Math.round(parseContext(provider) * 100);
            }
            const cup = `<span foreground="${this._usageColor}">${usageCup(percent)}</span>`;

            const lines = [`${name}: ${cup} ${percent}%${resetPart}`];

            // Visible requests as a left-aligned, monospace table:
            // agent | time | first characters of the prompt.
            const requests = this._showRequests ? this._visibleRequests() : [];
            if (requests.length) {
                const agentWidth = Math.max(
                    ...requests.map(request => providerLabel(request.provider).length)
                );
                const rows = requests.map(request => {
                    const agent = providerLabel(request.provider).padEnd(agentWidth);
                    const time = formatClock(request.ts);
                    const text = request.text.slice(0, this._requestPreview);
                    return escapeMarkup(`${agent}  ${time}  ${text}`);
                });
                lines.push(`<tt>${rows.join('\n')}</tt>`);
            }

            return lines.join('\n');
        }

        _onHoverChanged() {
            if (this.hover) {
                this._updateTooltip();
                this._tooltip.opacity = 0;
                this._tooltip.visible = true;
                this._tooltip.ease({
                    opacity: 255,
                    duration: TOOLTIP_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                this._tooltip.ease({
                    opacity: 0,
                    duration: TOOLTIP_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        if (this._tooltip)
                            this._tooltip.visible = false;
                    },
                });
            }
        }

        // Refresh text/position in place without touching opacity, so periodic
        // updates while hovering do not make the tooltip blink.
        _updateTooltip() {
            this._tooltip.clutter_text.set_markup(this._tooltipMarkup());
            this._positionTooltip();
        }

        _positionTooltip() {
            const [stageX, stageY] = this.get_transformed_position();
            const [actorWidth, actorHeight] = this.allocation.get_size();
            const [tipWidth, tipHeight] = this._tooltip.get_size();
            const monitor = Main.layoutManager.findMonitorForActor(this);
            const x = Math.clamp(
                stageX + Math.floor((actorWidth - tipWidth) / 2),
                monitor.x,
                monitor.x + monitor.width - tipWidth
            );
            const y = stageY - monitor.y > actorHeight + TOOLTIP_OFFSET
                ? stageY - tipHeight - TOOLTIP_OFFSET
                : stageY + actorHeight + TOOLTIP_OFFSET;
            this._tooltip.set_position(x, y);
        }

        _draw() {
            const context = this.get_context();
            const [width, height] = this.get_surface_size();
            const themeNode = this.get_theme_node();
            const color = themeNode.get_foreground_color();

            context.setLineWidth(1);
            const foreground = [color.red / 255, color.green / 255, color.blue / 255];
            // Token graph: one column per sample, coloured by the provider that
            // won that sample (falls back to the theme foreground).
            for (let x = 0; x < HISTORY_WIDTH; x++) {
                const sample = this._samples[this._samples.length - HISTORY_WIDTH + x];
                const value = Math.clamp(
                    activeTokens(sample.tokens, this._minActiveTokens) / this._maxTokens,
                    0,
                    1
                );
                if (value <= 0)
                    continue;
                const hex = this._providerHex(sample.provider);
                const [r, g, b] = hex ? hexToRgb(hex) : foreground;
                context.setSourceRGBA(r, g, b, 0.9);
                const barHeight = value * (height - 1);
                context.rectangle(x, height - barHeight, 1, barHeight);
                context.fill();
            }

            // Vertical red markers: one per request in the visible window.
            const now = nowSeconds();
            for (const request of this._visibleRequests()) {
                const age = now - request.ts;
                const markerX = (HISTORY_WIDTH - 1) - age / SAMPLE_INTERVAL_SECONDS;
                if (markerX < 0 || markerX > HISTORY_WIDTH)
                    continue;
                context.setSourceRGBA(...REQUEST_COLOR);
                context.rectangle(Math.round(markerX), 0, 1, height);
                context.fill();
            }

            const current = this._samples[this._samples.length - 1];
            const bars = [
                {value: current.context, color: [...hexToRgb(this._windowColor), 0.95]},
                {value: current.limit, color: [...hexToRgb(this._usageColor), 0.95]},
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
            if (this._hoverId) {
                this.disconnect(this._hoverId);
                this._hoverId = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            this._stopCodexHelper();
            this._stopClaudeHttpHook();
            super.destroy();
        }
    }
);
