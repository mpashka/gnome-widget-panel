// @ts-nocheck
// @tag:widget-ai-agent-status @tag:ai-collector
'use strict';

// One dot saying whether an AI agent needs you right now. It is a **view** of
// the extension's AI collector (../../aiCollector.ts) and owns no collection of
// its own: it used to run a second `Soup.Server` on its own port beside the
// usage widget's, which meant removing the widget stopped the collection and an
// empty dot could equally mean "no sessions" or "nobody is listening". Those two
// are now different pictures.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {COLLECTOR_OFF_TEXT} from '../../aiCollector.js';
import {hexToRgb, nowSeconds, toNumber} from '../../colorUtils.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';
import {pulseOpacity} from './pulse.js';

const DOT_SIZE = 12;
const DOT_SPACING = 4;
const DEFAULT_EXPIRE_MINUTES = 180;
// A 'thinking' session with no events for this long is presumed finished (a Stop
// we never saw) and reads as 'idle' — still open, ready for the next prompt.
const THINKING_STALE_SECONDS = 10 * 60;
const TICK_INTERVAL_SECONDS = 5;
// One half of the pulse — full brightness down to dim, or back up.
const PULSE_INTERVAL_MS = 600;
// How long one opacity step lasts. The pulse is stepped rather than eased
// because an eased one interpolates at the monitor's frame rate: ~3 % of a CPU
// core for one 12 px dot, for as long as a promptable session exists (gwp-231,
// measured in the headless stand). One frame per step makes that price a
// setting, and 100 ms (10 steps a second) is smooth to the eye.
const PULSE_STEP_MS = 100;
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
// Dim grey, for both dots that carry no session state: the hollow placeholder
// (collector on, nothing open) and the struck-through one (collector off).
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



export const AiAgentStatus = GObject.registerClass(
    class AiAgentStatus extends St.BoxLayout {
        constructor(collector, options = {}) {
            super({
                style_class: 'ai-agent-status',
                style: `spacing: ${DOT_SPACING}px;`,
                reactive: true,
                track_hover: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            // --- options (defensive parsing) ---------------------------------
            // How long a session with no events at all still counts as open. A
            // display policy, so it is applied here and not in the collector,
            // which keeps the raw events.
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
            this._collector = collector ?? null;
            this._collectorToken = this._collector
                ? this._collector.addListener(() => this._refresh())
                : null;
            this._dots = [];
            this._dotState = undefined;
            this._pulseStep = 0;
            this._pulseTimeoutId = 0;
            this._rotated = false;

            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            this._tooltip.clutter_text.line_alignment = Pango.Alignment.LEFT;
            Main.uiGroup.add_child(this._tooltip);
            this._hoverId = this.connect('notify::hover', () => this._onHoverChanged());

            // Ages, expiry and the thinking-went-stale transition are all
            // computed from the collector's timestamps when drawing, so a plain
            // periodic re-read is what makes them move.
            this._tickTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                TICK_INTERVAL_SECONDS,
                () => {
                    this._refresh();
                    return GLib.SOURCE_CONTINUE;
                }
            );
            // The attention pulse is started by _syncPulseTimer, from here via
            // _rebuildDots, and only while a dot actually pulses.
            this._rebuildDots();
        }

        // --- reading the collector ---------------------------------------------

        _collecting() {
            return !!this._collector?.running;
        }

        // The sessions that still count as open, most urgent first. Expiry and
        // the "thinking for too long" fallback are applied here rather than
        // stored: the collector records what happened, this widget decides how
        // long that keeps meaning something.
        _openSessions() {
            const now = nowSeconds();
            const open = [];
            for (const session of this._collector?.sessions.values() ?? []) {
                const age = now - session.lastEvent;
                if (age > this._expireSeconds)
                    continue;
                if (session.state === 'thinking' && age > THINKING_STALE_SECONDS) {
                    open.push({
                        ...session,
                        state: 'idle',
                        // It became idle when it went quiet, not now — otherwise
                        // the age in the tooltip would restart on every read.
                        lastChange: session.lastEvent + THINKING_STALE_SECONDS,
                    });
                    continue;
                }
                open.push(session);
            }
            return open.sort((a, b) => {
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
        // `_openSessions()` sorts by, so element 0 is the winner). Its whole job
        // is a glanceable "an agent needs you" / "an agent finished" cue while the
        // conversation is hidden, so one dot is enough — showing one per session
        // would waste panel space and split the user's attention. The tooltip
        // breaks the aggregate down per session (which agent needs what).
        _rebuildDots() {
            // Three pictures, not two: the most urgent session's colour, a hollow
            // dot when the collector is running with nothing open, and a struck
            // dot when it is switched off. The last two used to be the same dot,
            // which is exactly the confusion this widget was reported for.
            const state = this._collecting()
                ? this._openSessions()[0]?.state ?? null
                : 'off';
            // Almost nothing that gets here changes that one state: the 5 s tick
            // re-reads timestamps the dot does not draw, and the collector
            // notifies on every provider payload — token counts only the usage
            // widget reads. Rebuilding regardless destroyed and recreated the
            // actor about twice a second, relaying out the panel to draw the
            // identical dot (gwp-231).
            if (this._dots.length > 0 && state === this._dotState)
                return;
            this._dotState = state;
            for (const dot of this._dots)
                dot.destroy();
            this._dots = [];
            this.add_child(this._makeDot(state));
            this._syncPulseTimer();
        }

        _makeDot(state) {
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
            if (state && state !== 'off') {
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
                // Placeholder: dim hollow grey dot (no open sessions), with a
                // diagonal stroke through it when nothing is collecting — the
                // universal "switched off", so the difference is visible without
                // hovering for the tooltip.
                const [r, g, b] = hexToRgb(PLACEHOLDER_HEX);
                context.setLineWidth(1);
                context.setSourceRGBA(r, g, b, 0.6);
                context.arc(cx, cy, radius, 0, 2 * Math.PI);
                context.stroke();
                if (state === 'off') {
                    const offset = radius * Math.SQRT1_2;
                    context.moveTo(cx - offset, cy + offset);
                    context.lineTo(cx + offset, cy - offset);
                    context.stroke();
                }
            }
            context.$dispose();
        }

        // A never-ending opacity animation keeps Clutter's frame clock awake for
        // as long as it runs, so it exists only while there is a promptable
        // session to point at — not for the whole life of the session, easing an
        // opacity no dot was using (gwp-231).
        _syncPulseTimer() {
            const pulsing = this._dots.some(dot => dot._pulses);
            if (pulsing === !!this._pulseTimeoutId)
                return;
            if (pulsing) {
                this._pulseStep = 0;
                this._pulseTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    PULSE_STEP_MS,
                    () => {
                        this._pulseTick();
                        return GLib.SOURCE_CONTINUE;
                    }
                );
                return;
            }
            GLib.Source.remove(this._pulseTimeoutId);
            this._pulseTimeoutId = 0;
            this._pulseStep = 0;
            for (const dot of this._dots)
                dot.opacity = 255;
        }

        _pulseTick() {
            this._pulseStep += 1;
            const opacity = pulseOpacity(
                this._pulseStep,
                PULSE_INTERVAL_MS / PULSE_STEP_MS,
                PULSE_LOW_OPACITY
            );
            for (const dot of this._dots)
                dot.opacity = dot._pulses ? opacity : 255;
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
            if (!this._collecting())
                return COLLECTOR_OFF_TEXT;
            const sessions = this._openSessions();
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
            if (this._collectorToken !== null) {
                this._collector?.removeListener(this._collectorToken);
                this._collectorToken = null;
            }
            this._collector = null;
            if (this._tickTimeoutId) {
                GLib.Source.remove(this._tickTimeoutId);
                this._tickTimeoutId = null;
            }
            if (this._pulseTimeoutId) {
                GLib.Source.remove(this._pulseTimeoutId);
                this._pulseTimeoutId = 0;
            }
            if (this._hoverId) {
                this.disconnect(this._hoverId);
                this._hoverId = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            super.destroy();
        }
    }
);
