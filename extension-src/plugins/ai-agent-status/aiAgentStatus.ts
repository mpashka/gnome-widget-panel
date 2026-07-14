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
import {hexToRgb, nowSeconds, toNumber} from '../../colorUtils.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';

const DEFAULT_PORT = 17871;
const DOT_SIZE = 12;
const DOT_SPACING = 4;
const DEFAULT_EXPIRE_MINUTES = 180;
// A 'thinking' session with no events for this long is presumed finished (a Stop
// we never saw) and drops to 'idle' — still open, ready for the next prompt.
const THINKING_STALE_SECONDS = 10 * 60;
const TICK_INTERVAL_SECONDS = 5;
const PULSE_INTERVAL_MS = 600;
const PULSE_LOW_OPACITY = 120;
// The three per-session states (options carry these default colours). 'waiting'
// (the agent explicitly wants you) and 'idle' (finished — ready for your next
// prompt) are both promptable and pulse; 'thinking' (agent working — nothing to
// do but wait) is solid. A pulsing dot therefore always means "a session you can
// type into right now".
const DEFAULT_COLORS = {
    waitingColor: '#f03333',   // red — the agent is asking you something
    idleColor: '#ffb82e',      // amber — done, ready for your next prompt
    thinkingColor: '#4ca6ff',  // blue — generating, just wait
};
// Dim grey hollow placeholder shown when there are no open sessions.
const PLACEHOLDER_HEX = '#777777';
// Single-dot priority (highest first): a session you must answer outranks one
// you may prompt, which outranks one that's merely working. No sessions -> the
// placeholder. This is the merge order for the one aggregated dot.
const STATE_ORDER = ['waiting', 'idle', 'thinking'];
// Default hover-tooltip template. Tokens: {counts} (one summary line, e.g.
// `1 waiting · 2 busy · 1 idle`) and {sessions} (one monospace line per
// session). Literal text is Pango-escaped; `\n` is a line break.
const DEFAULT_TOOLTIP_TEMPLATE = '{counts}\n{sessions}';

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
            this._expireSeconds = Math.max(
                60,
                Math.round(toNumber(options.expireMinutes, DEFAULT_EXPIRE_MINUTES)) * 60);
            // Pulse the 'idle' (ready-for-prompt) dot too, not only 'waiting'.
            this._pulseIdle = options.pulseIdle !== false;
            this._showTooltip = options.showTooltip !== false;
            this._template = typeof options.template === 'string'
                ? options.template
                : DEFAULT_TOOLTIP_TEMPLATE;
            this._colors = {
                'waiting': options.waitingColor || DEFAULT_COLORS.waitingColor,
                'idle': options.idleColor || DEFAULT_COLORS.idleColor,
                'thinking': options.thinkingColor || DEFAULT_COLORS.thinkingColor,
            };

            // --- state --------------------------------------------------------
            // session_id -> {id, cwd, label, provider, state, lastEvent, lastChange}
            this._sessions = new Map();
            this._dots = [];
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
                // Best-effort, fire-and-forget: _startServer runs from the
                // synchronous _init, so let the async registration run detached
                // and just log failures.
                ClaudeHook.registerPort(this._port, this._secret).catch(
                    (error) => logError(error, 'GNOME Widget Panel agent-status register failed')
                );
                this._registered = true;
            } catch (error) {
                logError(error, 'GNOME Widget Panel agent-status server failed');
                this._stopServer();
            }
        }

        _stopServer() {
            if (this._registered) {
                // Best-effort, fire-and-forget: destroy() cannot await, so let
                // the async deregistration run detached and just log failures.
                ClaudeHook.deregisterPort(this._port).catch(
                    (error) => logError(error, 'GNOME Widget Panel agent-status deregister failed')
                );
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
            // Soup.ServerMessage has no `request-headers` GObject property
            // (unlike the client-side Soup.Message the hook scripts use),
            // only the `get_request_headers()` method — reading
            // `msg.request_headers` is always undefined and throws on
            // `.get_one`, rejecting every request before it is checked (same
            // root cause as issue #6's ai-agent-usage hook delivery).
            const token = msg.get_request_headers().get_one('X-Gnome-Widget-Panel-Token');
            if (token !== this._secret) {
                msg.set_status(Soup.Status.FORBIDDEN, null);
                return null;
            }
            const text = new TextDecoder().decode(
                msg.get_request_body().flatten().get_data()
            );
            if (!text.trim()) {
                // Empty POST: nothing to do, not a parse error. 204 keeps the
                // statusLine fan-out from mistaking it for a status line body.
                msg.set_status(Soup.Status.NO_CONTENT, null);
                return null;
            }
            return JSON.parse(text);
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
                logError(error, 'GNOME Widget Panel agent-event failed');
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
                logError(error, 'GNOME Widget Panel agent-status statusline failed');
                msg.set_status(Soup.Status.BAD_REQUEST, null);
            }
        }

        // --- session state machine --------------------------------------------

        // Event -> state: UserPromptSubmit/statusline activity -> thinking,
        // Notification -> waiting, Stop -> idle, SessionEnd -> removed.
        // 'waiting' has the highest priority: background statusline activity
        // must not demote it — only an explicit UserPromptSubmit (the user
        // answered) or Stop/SessionEnd moves it on.
        _applyEvent(eventName, id, cwd) {
            const now = nowSeconds();
            if (eventName === 'SessionEnd') {
                if (this._sessions.delete(id))
                    this._refresh();
                return;
            }
            let state = null;
            if (eventName === 'UserPromptSubmit' || eventName === 'statusline-activity')
                state = 'thinking';
            else if (eventName === 'Notification')
                state = 'waiting';
            else if (eventName === 'Stop')
                state = 'idle';
            if (!state)
                return;

            let session = this._sessions.get(id);
            if (eventName === 'statusline-activity'
                && session?.state === 'waiting') {
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

        // Liveness fallback for missed hook events. A session normally leaves
        // 'thinking' via its own Stop event; if we never saw one, drop it to
        // 'idle' after THINKING_STALE_SECONDS so a stuck dot doesn't claim the
        // agent is still working. Any session with no events at all for
        // expireMinutes is presumed gone (missed SessionEnd) and removed —
        // leaving only genuinely open sessions.
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
                if (session.state === 'thinking' && age > THINKING_STALE_SECONDS) {
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

        // --- visualization: one dot aggregating every session -----------------

        // A single dot represents ALL sessions, coloured by the most-urgent state
        // among them (waiting > idle > thinking — the STATE_ORDER
        // `_sortedSessions()` sorts by, so element 0 is the winner). Its whole job
        // is a glanceable "an agent needs you" / "an agent finished" cue while the
        // conversation is hidden, so one dot is enough — showing one per session
        // would waste panel space and split the user's attention. The tooltip
        // breaks the aggregate down per session (which agent needs what).
        _rebuildDots() {
            for (const dot of this._dots)
                dot.destroy();
            this._dots = [];

            // `_sortedSessions()[0]` is the most-urgent session, or `null` when
            // idle — `_makeDot(null)` then draws a dim hollow placeholder so the
            // widget stays visible and hoverable.
            this.add_child(this._makeDot(this._sortedSessions()[0] ?? null));
        }

        _makeDot(session) {
            const state = session?.state ?? null;
            const dot = new St.DrawingArea({
                width: DOT_SIZE,
                height: DOT_SIZE,
                y_align: Clutter.ActorAlign.CENTER,
            });
            // Pulse the promptable states (a session you can type into now):
            // always 'waiting', and 'idle' unless the user turned it off.
            dot._pulses = state === 'waiting'
                || (state === 'idle' && this._pulseIdle);
            dot.connect('repaint', () => {
                try {
                    this._drawDot(dot, state);
                } catch (error) {
                    logError(error, 'GNOME Widget Panel agent-status draw failed');
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
                const [r, g, b] = hexToRgb(this._colors[state] ?? PLACEHOLDER_HEX);
                context.setSourceRGBA(r, g, b, 1);
                context.arc(cx, cy, radius, 0, 2 * Math.PI);
                context.fill();
                // The promptable states get a brighter ring so they stand out
                // even for colour-impaired users / tiny dots.
                if (state === 'waiting' || state === 'idle') {
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
                // Placeholder: dim hollow grey dot (no open sessions).
                const [r, g, b] = hexToRgb(PLACEHOLDER_HEX);
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
            const counts = {waiting: 0, idle: 0, thinking: 0};
            for (const session of sessions)
                counts[session.state] = (counts[session.state] ?? 0) + 1;
            const parts = [];
            if (counts.waiting)
                parts.push(`<span foreground="${this._colors.waiting}">${counts.waiting} waiting</span>`);
            if (counts.idle)
                parts.push(`<span foreground="${this._colors.idle}">${counts.idle} idle</span>`);
            if (counts.thinking)
                parts.push(`${counts.thinking} thinking`);
            return parts.join(' · ');
        }

        _sessionsFragment(sessions) {
            const now = nowSeconds();
            const labelWidth = Math.max(...sessions.map(s => s.label.length));
            const stateWidth = Math.max(...sessions.map(s => s.state.length));
            const rows = sessions.map(session => {
                const hex = this._colors[session.state] ?? PLACEHOLDER_HEX;
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
                animateTooltipVisibility(this, true);
            } else {
                animateTooltipVisibility(this, false);
            }
        }

        // Refresh text/position in place without touching opacity, so periodic
        // updates while hovering do not make the tooltip blink.
        _updateTooltip() {
            if (!this._tooltip)
                return;
            this._tooltip.clutter_text.set_markup(this._tooltipMarkup());
            positionTooltip(this);
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
