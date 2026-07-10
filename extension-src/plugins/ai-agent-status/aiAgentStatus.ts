// @ts-nocheck
// @tag:widget-ai-agent-status
'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as ClaudeHook from '../ai-agent-usage/claudeHook.js';
import {renderTemplate} from '../../tooltipTemplate.js';

const DEFAULT_PORT = 17871;
const DOT_SIZE = 12;
const DOT_SPACING = 4;
const DEFAULT_MAX_DOTS = 8;
const DEFAULT_IDLE_MINUTES = 30;
const DEFAULT_EXPIRE_MINUTES = 180;
// A 'busy' session with no events for this long is presumed dead/abandoned.
const BUSY_STALE_SECONDS = 10 * 60;
const TICK_INTERVAL_SECONDS = 5;
const PULSE_INTERVAL_MS = 600;
const PULSE_LOW_OPACITY = 120;
const TOOLTIP_OFFSET = 6;
const TOOLTIP_ANIMATION_TIME = 150;
// State colours (options with these defaults).
const DEFAULT_COLORS = {
    needsInputColor: '#f03333',
    readyColor: '#3dc752',
    busyColor: '#4ca6ff',
    idleColor: '#777777',
};
// Sort order in the dot row and the tooltip: waiting-for-you states first.
const STATE_ORDER = ['needs-input', 'ready', 'busy', 'idle'];
// Default hover-tooltip template. Tokens: {counts} (one summary line, e.g.
// `1 waiting · 2 busy · 1 idle`) and {sessions} (one monospace line per
// session). Literal text is Pango-escaped; `\n` is a line break.
const DEFAULT_TOOLTIP_TEMPLATE = '{counts}\n{sessions}';

function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

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

function escapeMarkup(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatSince(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

// Session label: basename of the working directory, falling back to a short
// session-id prefix.
function sessionLabel(cwd, id) {
    const dir = typeof cwd === 'string' ? cwd.replace(/\/+$/, '') : '';
    if (dir) {
        const base = dir.split('/').filter(Boolean).pop();
        if (base)
            return base;
    }
    return String(id).slice(0, 8);
}

// Defensive extraction of `{session_id, cwd}` from a hook or statusLine
// payload (the statusLine payload keeps cwd under workspace.current_dir).
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

export const AiAgentStatus = GObject.registerClass(
    class AiAgentStatus extends St.BoxLayout {
        constructor(options = {}) {
            super({
                style_class: 'ai-agent-status',
                style: `spacing: ${DOT_SPACING}px;`,
                reactive: true,
                track_hover: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            // --- options (defensive parsing) ---------------------------------
            this._port = Math.round(toNumber(options.port, DEFAULT_PORT));
            if (this._port < 1024 || this._port > 65535)
                this._port = DEFAULT_PORT;
            // Prefer a persisted secret (written by the Configure button in
            // preferences) so the hooks and this server agree after a reload.
            this._secret = options.secret || GLib.uuid_string_random();
            this._idleSeconds = Math.max(
                60, Math.round(toNumber(options.idleMinutes, DEFAULT_IDLE_MINUTES)) * 60);
            this._expireSeconds = Math.max(
                this._idleSeconds,
                Math.round(toNumber(options.expireMinutes, DEFAULT_EXPIRE_MINUTES)) * 60);
            this._maxDots = Math.min(
                16, Math.max(1, Math.round(toNumber(options.maxDots, DEFAULT_MAX_DOTS))));
            this._pulseReady = options.pulseReady !== false;
            this._showTooltip = options.showTooltip !== false;
            this._template = typeof options.template === 'string'
                ? options.template
                : DEFAULT_TOOLTIP_TEMPLATE;
            this._colors = {
                'needs-input': options.needsInputColor || DEFAULT_COLORS.needsInputColor,
                'ready': options.readyColor || DEFAULT_COLORS.readyColor,
                'busy': options.busyColor || DEFAULT_COLORS.busyColor,
                'idle': options.idleColor || DEFAULT_COLORS.idleColor,
            };

            // --- state --------------------------------------------------------
            // session_id -> {id, cwd, label, provider, state, lastEvent, lastChange}
            this._sessions = new Map();
            this._dots = [];
            this._overflowLabel = null;
            this._pulsePhase = false;
            this._rotated = false;
            this._server = null;
            this._registered = false;

            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            this._tooltip.clutter_text.line_alignment = Pango.Alignment.LEFT;
            Main.uiGroup.add_child(this._tooltip);
            this._hoverId = this.connect('notify::hover', () => this._onHoverChanged());

            this._startServer();

            // Re-evaluate ages (idle/expire transitions) on a slow tick.
            this._tickTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                TICK_INTERVAL_SECONDS,
                () => {
                    this._tick();
                    return GLib.SOURCE_CONTINUE;
                }
            );
            // Attention pulse: ease the waiting dots' opacity between full and
            // dim on a fixed cadence (Clutter has no auto-reversing loop ease).
            this._pulseTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                PULSE_INTERVAL_MS,
                () => {
                    this._pulseTick();
                    return GLib.SOURCE_CONTINUE;
                }
            );

            this._rebuildDots();
        }

        // --- HTTP server (Claude hooks fan out to it) -------------------------

        _startServer() {
            try {
                this._server = new Soup.Server();
                this._server.add_handler('/agent-event', (server, msg) => {
                    this._handleAgentEvent(msg);
                });
                this._server.add_handler('/claude-statusline', (server, msg) => {
                    this._handleStatusLine(msg);
                });
                this._server.listen_local(
                    this._port,
                    Soup.ServerListenOptions.IPV4_ONLY
                );
                // Join the shared endpoint registry so the (port-independent)
                // status-line and event hooks fan out to this widget too.
                ClaudeHook.registerPort(this._port, this._secret);
                this._registered = true;
            } catch (error) {
                console.error(`GNOME Widget Panel agent-status server failed: ${error}`);
                this._stopServer();
            }
        }

        _stopServer() {
            if (this._registered) {
                try {
                    ClaudeHook.deregisterPort(this._port);
                } catch (error) {
                    console.error(`GNOME Widget Panel agent-status deregister failed: ${error}`);
                }
                this._registered = false;
            }
            if (this._server) {
                this._server.disconnect();
                this._server = null;
            }
        }

        _checkRequest(msg) {
            if (msg.get_method() !== 'POST') {
                msg.set_status(Soup.Status.METHOD_NOT_ALLOWED, null);
                return null;
            }
            const token = msg.request_headers.get_one('X-Gnome-Widget-Panel-Token');
            if (token !== this._secret) {
                msg.set_status(Soup.Status.FORBIDDEN, null);
                return null;
            }
            const body = msg.get_request_body().flatten().get_data();
            return JSON.parse(new TextDecoder().decode(body));
        }

        _handleAgentEvent(msg) {
            try {
                const payload = this._checkRequest(msg);
                if (payload === null)
                    return;
                const {id, cwd} = extractSession(payload);
                if (id)
                    this._applyEvent(String(payload?.hook_event_name ?? ''), id, cwd);
                msg.set_status(Soup.Status.OK, null);
            } catch (error) {
                console.error(`GNOME Widget Panel agent-event failed: ${error}`);
                msg.set_status(Soup.Status.BAD_REQUEST, null);
            }
        }

        // The statusLine hook fans out to every registered endpoint and prints
        // the FIRST 200 body as Claude's status line. This widget produces no
        // status line, so it must answer 204 No Content — never 200 — or its
        // empty body could hijack the status line from the usage widget.
        _handleStatusLine(msg) {
            try {
                const payload = this._checkRequest(msg);
                if (payload === null)
                    return;
                const {id, cwd} = extractSession(payload);
                // The status line only fires while Claude is generating: activity.
                if (id)
                    this._applyEvent('statusline-activity', id, cwd);
                msg.set_status(Soup.Status.NO_CONTENT, null);
            } catch (error) {
                console.error(`GNOME Widget Panel agent-status statusline failed: ${error}`);
                msg.set_status(Soup.Status.BAD_REQUEST, null);
            }
        }

        // --- session state machine --------------------------------------------

        // Event -> state: UserPromptSubmit/statusline activity -> busy,
        // Notification -> needs-input, Stop -> ready, SessionEnd -> removed.
        // 'needs-input' has the highest priority: background statusline
        // activity must not demote it — only an explicit UserPromptSubmit
        // (the user answered) or Stop/SessionEnd moves it on.
        _applyEvent(eventName, id, cwd) {
            const now = nowSeconds();
            if (eventName === 'SessionEnd') {
                if (this._sessions.delete(id))
                    this._refresh();
                return;
            }
            let state = null;
            if (eventName === 'UserPromptSubmit' || eventName === 'statusline-activity')
                state = 'busy';
            else if (eventName === 'Notification')
                state = 'needs-input';
            else if (eventName === 'Stop')
                state = 'ready';
            if (!state)
                return;

            let session = this._sessions.get(id);
            if (eventName === 'statusline-activity'
                && session?.state === 'needs-input') {
                session.lastEvent = now;
                return;
            }
            if (!session) {
                session = {
                    id,
                    cwd: cwd ?? null,
                    label: sessionLabel(cwd, id),
                    provider: 'claude',
                    state,
                    lastEvent: now,
                    lastChange: now,
                };
                this._sessions.set(id, session);
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
            this._refresh();
        }

        // Age out sessions: any state goes 'idle' after idleMinutes without
        // events ('busy' already after BUSY_STALE_SECONDS — a dead session must
        // not look busy forever); everything is dropped after expireMinutes.
        _tick() {
            const now = nowSeconds();
            let changed = false;
            for (const [id, session] of this._sessions) {
                const age = now - session.lastEvent;
                if (age > this._expireSeconds) {
                    this._sessions.delete(id);
                    changed = true;
                    continue;
                }
                const idleAfter = session.state === 'busy'
                    ? Math.min(BUSY_STALE_SECONDS, this._idleSeconds)
                    : this._idleSeconds;
                if (session.state !== 'idle' && age > idleAfter) {
                    session.state = 'idle';
                    session.lastChange = now;
                    changed = true;
                }
            }
            if (changed)
                this._refresh();
            else if (this.hover && this._showTooltip)
                this._updateTooltip(); // keep the m:ss ages fresh
        }

        _sortedSessions() {
            return [...this._sessions.values()].sort((a, b) => {
                const order = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
                if (order !== 0)
                    return order;
                return b.lastChange - a.lastChange;
            });
        }

        _refresh() {
            this._rebuildDots();
            if (this.hover && this._showTooltip)
                this._updateTooltip();
        }

        // --- visualization: one dot per session --------------------------------

        _rebuildDots() {
            for (const dot of this._dots)
                dot.destroy();
            this._dots = [];
            if (this._overflowLabel) {
                this._overflowLabel.destroy();
                this._overflowLabel = null;
            }

            const sessions = this._sortedSessions();
            if (sessions.length === 0) {
                // Dim placeholder so the widget stays visible (and hoverable).
                this.add_child(this._makeDot(null));
                return;
            }
            for (const session of sessions.slice(0, this._maxDots))
                this.add_child(this._makeDot(session));
            const overflow = sessions.length - this._maxDots;
            if (overflow > 0) {
                this._overflowLabel = new St.Label({
                    text: `+${overflow}`,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: 'font-size: 9px;',
                });
                this.add_child(this._overflowLabel);
            }
        }

        _makeDot(session) {
            const state = session?.state ?? null;
            const dot = new St.DrawingArea({
                width: DOT_SIZE,
                height: DOT_SIZE,
                y_align: Clutter.ActorAlign.CENTER,
            });
            dot._pulses = state === 'needs-input'
                || (state === 'ready' && this._pulseReady);
            dot.connect('repaint', () => {
                try {
                    this._drawDot(dot, state);
                } catch (error) {
                    console.error(`GNOME Widget Panel agent-status draw failed: ${error}`);
                }
            });
            this._dots.push(dot);
            return dot;
        }

        _drawDot(dot, state) {
            const context = dot.get_context();
            const [w, h] = dot.get_surface_size();
            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.min(w, h) / 2 - 1.5;
            if (state) {
                const [r, g, b] = hexToRgb(this._colors[state] ?? DEFAULT_COLORS.idleColor);
                context.setSourceRGBA(r, g, b, 1);
                context.arc(cx, cy, radius, 0, 2 * Math.PI);
                context.fill();
                // Waiting states get a brighter ring so they stand out even for
                // colour-impaired users / tiny dots.
                if (state === 'needs-input' || state === 'ready') {
                    context.setLineWidth(1);
                    context.setSourceRGBA(
                        Math.min(1, r + 0.35),
                        Math.min(1, g + 0.35),
                        Math.min(1, b + 0.35),
                        1
                    );
                    context.arc(cx, cy, radius + 1, 0, 2 * Math.PI);
                    context.stroke();
                }
            } else {
                // Placeholder: dim hollow dot.
                const [r, g, b] = hexToRgb(this._colors.idle);
                context.setLineWidth(1);
                context.setSourceRGBA(r, g, b, 0.6);
                context.arc(cx, cy, radius, 0, 2 * Math.PI);
                context.stroke();
            }
            context.$dispose();
        }

        _pulseTick() {
            this._pulsePhase = !this._pulsePhase;
            const target = this._pulsePhase ? PULSE_LOW_OPACITY : 255;
            for (const dot of this._dots) {
                if (!dot._pulses) {
                    if (dot.opacity !== 255)
                        dot.opacity = 255;
                    continue;
                }
                dot.ease({
                    opacity: target,
                    duration: PULSE_INTERVAL_MS,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                });
            }
        }

        // --- tooltip ------------------------------------------------------------

        _countsFragment(sessions) {
            const counts = {waiting: 0, busy: 0, idle: 0};
            for (const session of sessions) {
                if (session.state === 'needs-input' || session.state === 'ready')
                    counts.waiting++;
                else if (session.state === 'busy')
                    counts.busy++;
                else
                    counts.idle++;
            }
            const parts = [];
            if (counts.waiting) {
                const hex = this._colors['needs-input'];
                parts.push(`<span foreground="${hex}">${counts.waiting} waiting</span>`);
            }
            if (counts.busy)
                parts.push(`${counts.busy} busy`);
            if (counts.idle)
                parts.push(`${counts.idle} idle`);
            return parts.join(' · ');
        }

        _sessionsFragment(sessions) {
            const now = nowSeconds();
            const labelWidth = Math.max(...sessions.map(s => s.label.length));
            const stateWidth = Math.max(...sessions.map(s => s.state.length));
            const rows = sessions.map(session => {
                const hex = this._colors[session.state] ?? DEFAULT_COLORS.idleColor;
                const label = escapeMarkup(session.label.padEnd(labelWidth));
                const state = session.state.padEnd(stateWidth);
                const since = formatSince(now - session.lastChange);
                return `<span foreground="${hex}">●</span> ${label}  ${state}  ${since}`;
            });
            return `<tt>${rows.join('\n')}</tt>`;
        }

        _tooltipMarkup() {
            const sessions = this._sortedSessions();
            if (sessions.length === 0)
                return 'AI agents: no sessions';
            return renderTemplate(this._template, {
                counts: this._countsFragment(sessions),
                sessions: this._sessionsFragment(sessions),
            }).replace(/\n+$/, '');
        }

        _onHoverChanged() {
            if (!this._showTooltip || !this._tooltip)
                return;
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
            if (!this._tooltip)
                return;
            this._tooltip.clutter_text.set_markup(this._tooltipMarkup());
            this._positionTooltip();
        }

        _positionTooltip() {
            const [stageX, stageY] = this.get_transformed_position();
            const [actorWidth, actorHeight] = this.allocation.get_size();
            const [tipWidth, tipHeight] = this._tooltip.get_size();
            const monitor = Main.layoutManager.findMonitorForActor(this);
            if (this._rotated) {
                // Vertical panel: the strip hugs a screen edge, so an above/below
                // tooltip would overlap the strip and its neighbours. Place the
                // tooltip beside the widget, on whichever side has more room
                // (widget in the right half of the monitor → left, else right),
                // vertically centred on the widget and clamped to the monitor.
                const widgetCenterX = stageX + actorWidth / 2;
                const placeLeft =
                    widgetCenterX > monitor.x + monitor.width / 2;
                const x = placeLeft
                    ? stageX - tipWidth - TOOLTIP_OFFSET
                    : stageX + actorWidth + TOOLTIP_OFFSET;
                const clampedX = Math.clamp(
                    x,
                    monitor.x,
                    monitor.x + monitor.width - tipWidth
                );
                const y = Math.clamp(
                    stageY + Math.floor((actorHeight - tipHeight) / 2),
                    monitor.y,
                    monitor.y + monitor.height - tipHeight
                );
                this._tooltip.set_position(clampedX, y);
                return;
            }
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

        // Called by the panel host on orientation/rotation changes. A dot row is
        // orientation-neutral (round dots need no rotation); we only stack the
        // dots vertically and remember the layout for the tooltip placement.
        setPanelLayout(info) {
            this._rotated = !!(info && info.vertical);
            this.orientation = this._rotated
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL;
        }

        destroy() {
            if (this._tickTimeoutId) {
                GLib.Source.remove(this._tickTimeoutId);
                this._tickTimeoutId = null;
            }
            if (this._pulseTimeoutId) {
                GLib.Source.remove(this._pulseTimeoutId);
                this._pulseTimeoutId = null;
            }
            if (this._hoverId) {
                this.disconnect(this._hoverId);
                this._hoverId = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            this._stopServer();
            super.destroy();
        }
    }
);
