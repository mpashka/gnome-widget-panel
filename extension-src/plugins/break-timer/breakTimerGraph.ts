// @ts-nocheck
// @tag:widget-break-timer
//
// Workrave-style rest reminders: an St.DrawingArea painting up to three
// stacked progress bars (micro/rest/daily), each tracking activity time (not
// wall-clock time) against a per-timer work interval. See index.md for the
// activity-tracking and break-detection mechanics.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {hexToRgb, toNumber} from '../../colorUtils.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';

const WIDTH = 32;
const HEIGHT = 16;
const TICK_INTERVAL_SECONDS = 1;
// Idle below this threshold counts as "the user is active" for accumulating
// elapsed activity time; idle at/above a timer's own breakSeconds resets that
// timer (taking the break resets it).
const ACTIVE_IDLE_THRESHOLD_MS = 5000;
const BAR_GAP = 1;

// Default hover-tooltip template. Tokens: {micro}, {rest}, {daily}, each a
// coloured `name: elapsed/limit` Pango fragment (empty when the timer is
// disabled). See ../../tooltipTemplate.ts.
const DEFAULT_TOOLTIP_TEMPLATE = '{micro}\n{rest}\n{daily}';

const DEFAULT_TIMERS = [
    {
        name: 'micro',
        enabled: true,
        workMinutes: 10,
        breakSeconds: 30,
        color: '#4ca6ff',
        overdueColor: '#f03333',
    },
    {
        name: 'rest',
        enabled: true,
        workMinutes: 50,
        breakSeconds: 480,
        color: '#3dc752',
        overdueColor: '#f03333',
    },
    {
        name: 'daily',
        enabled: false,
        workMinutes: 360,
        breakSeconds: 0,
        color: '#ffb82e',
        overdueColor: '#f03333',
    },
];

// Normalize the configured timers: fixed name/count/order (micro, rest,
// daily); enabled/workMinutes/breakSeconds/colors are taken from the matching
// input entry when valid, defaulted otherwise. Mirrors cpuGraph's
// normalizeBands defensive pattern.
function normalizeTimers(timers) {
    const source = Array.isArray(timers) ? timers : [];
    return DEFAULT_TIMERS.map(def => {
        const match = source.find(t => t && t.name === def.name) ?? {};
        const workMinutes = toNumber(match.workMinutes, NaN);
        const breakSeconds = toNumber(match.breakSeconds, NaN);
        return {
            name: def.name,
            enabled: typeof match.enabled === 'boolean' ? match.enabled : def.enabled,
            workMinutes: Number.isFinite(workMinutes) && workMinutes > 0
                ? workMinutes : def.workMinutes,
            breakSeconds: Number.isFinite(breakSeconds) && breakSeconds >= 0
                ? breakSeconds : def.breakSeconds,
            color: typeof match.color === 'string' && match.color.length > 0
                ? match.color : def.color,
            overdueColor: typeof match.overdueColor === 'string' && match.overdueColor.length > 0
                ? match.overdueColor : def.overdueColor,
        };
    });
}

// Adaptive `H:MM:SS` (once an hour is reached) / `M:SS` duration formatter,
// used for both the graph tooltip and the settings preview.
function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0)
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// Local calendar-day key used to detect midnight rollover for the daily timer.
function localDayKey() {
    return new Date().toDateString();
}

export const BreakTimerGraph = GObject.registerClass(
    class BreakTimerGraph extends St.DrawingArea {
        constructor(options = {}) {
            const width = Math.max(1, Math.round(toNumber(options.width, WIDTH)));
            super({
                style_class: 'break-timer-graph',
                width,
                height: HEIGHT,
                reactive: true,
                track_hover: true,
            });

            this._width = width;
            // Base (unrotated) size; the actor size is swapped when the panel is
            // vertical (see setPanelLayout / the rotated branch in _draw).
            this._baseWidth = width;
            this._baseHeight = HEIGHT;
            this._rotated = false;
            this._rotateDir = 'right';

            this._timers = normalizeTimers(options.timers);
            this._showTooltip = options.showTooltip !== false;
            this._template = typeof options.template === 'string'
                ? options.template
                : DEFAULT_TOOLTIP_TEMPLATE;

            // Activity-based elapsed seconds per timer name; in-memory only, no
            // persistence (see index.md).
            this._elapsed = {micro: 0, rest: 0, daily: 0};
            this._currentDay = localDayKey();

            // Capability check: Meta.IdleMonitor may be unavailable in some Shell
            // configurations. Fall back to treating every tick as "active" so the
            // widget degrades to plain accumulating counters rather than throwing
            // out of create().
            this._idleMonitor = null;
            this._idleCapable = false;
            try {
                const monitor = global.backend.get_core_idle_monitor();
                const probe = monitor.get_idletime();
                if (typeof probe === 'number') {
                    this._idleMonitor = monitor;
                    this._idleCapable = true;
                }
            } catch (error) {
                this._idleMonitor = null;
                this._idleCapable = false;
            }

            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            Main.uiGroup.add_child(this._tooltip);
            this._repaintId = this.connect('repaint', () => this._draw());
            this._hoverId = this.connect('notify::hover', () => this._onHoverChanged());
            this._timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                TICK_INTERVAL_SECONDS,
                () => {
                    this._tick();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        _readIdleMs() {
            if (!this._idleCapable)
                return 0;
            try {
                return this._idleMonitor.get_idletime();
            } catch (error) {
                return 0;
            }
        }

        _tick() {
            const idleMs = this._readIdleMs();
            const idleSeconds = idleMs / 1000;
            const active = idleMs < ACTIVE_IDLE_THRESHOLD_MS;

            const today = localDayKey();
            if (today !== this._currentDay) {
                this._currentDay = today;
                this._elapsed.daily = 0;
            }

            for (const timer of this._timers) {
                if (!timer.enabled)
                    continue;
                // Continuous idle at/above the timer's own break length means the
                // break was taken; reset it. A rest-length idle is also >= the
                // (shorter) micro breakSeconds, so it resets micro too.
                if (timer.breakSeconds > 0 && idleSeconds >= timer.breakSeconds)
                    this._elapsed[timer.name] = 0;
                else if (active)
                    this._elapsed[timer.name] = (this._elapsed[timer.name] ?? 0) + TICK_INTERVAL_SECONDS;
            }

            if (this.hover)
                this._updateTooltip();
            this.queue_repaint();
        }

        _limitSeconds(timer) {
            return timer.workMinutes * 60;
        }

        _isOverdue(timer) {
            const limit = this._limitSeconds(timer);
            return limit > 0 && (this._elapsed[timer.name] ?? 0) >= limit;
        }

        // Build the coloured Pango-markup fragment for one timer's tooltip token;
        // empty for a disabled timer so the template line collapses.
        _timerFragment(timer) {
            if (!timer.enabled)
                return '';
            const elapsed = this._elapsed[timer.name] ?? 0;
            const limit = this._limitSeconds(timer);
            const overdue = this._isOverdue(timer);
            const text = `${timer.name}: ${formatDuration(elapsed)}/${formatDuration(limit)}`;
            const color = overdue ? timer.overdueColor : timer.color;
            const suffix = overdue ? ' — break!' : '';
            return `<span foreground="${color}">${text}${suffix}</span>`;
        }

        _tooltipFragments() {
            const fragments = {};
            for (const timer of this._timers)
                fragments[timer.name] = this._timerFragment(timer);
            return fragments;
        }

        _tooltipMarkup() {
            return renderTemplate(this._template, this._tooltipFragments());
        }

        _onHoverChanged() {
            if (this._showTooltip && this.hover) {
                this._updateTooltip();
                animateTooltipVisibility(this, true);
            } else {
                animateTooltipVisibility(this, false);
            }
        }

        // Refresh text/position in place without touching opacity, so periodic
        // updates while hovering do not make the tooltip blink.
        _updateTooltip() {
            this._tooltip.clutter_text.set_markup(this._tooltipMarkup());
            positionTooltip(this);
        }

        // Rotate the vertical panel: when rotated the actor/surface is swapped
        // (see setPanelLayout); draw in the base (unrotated) coordinate space and
        // let the transform map it into the tall/narrow surface.
        _applyRotation(context, sw, sh) {
            if (!this._rotated)
                return;
            if (this._rotateDir === 'left') {
                context.translate(0, sh);
                context.rotate(-Math.PI / 2);
            } else {
                context.translate(sw, 0);
                context.rotate(Math.PI / 2);
            }
        }

        _draw() {
            const context = this.get_context();
            const [sw, sh] = this.get_surface_size();
            const width = this._rotated ? this._baseWidth : sw;
            const height = this._rotated ? this._baseHeight : sh;
            const themeNode = this.get_theme_node();
            const color = themeNode.get_foreground_color();
            const fg = [color.red / 255, color.green / 255, color.blue / 255];

            context.save();
            this._applyRotation(context, sw, sh);

            const enabled = this._timers.filter(timer => timer.enabled);
            if (enabled.length === 0) {
                context.restore();
                context.$dispose();
                return;
            }

            const totalGap = BAR_GAP * (enabled.length - 1);
            const sliceHeight = Math.max(1, (height - totalGap) / enabled.length);

            enabled.forEach((timer, index) => {
                const y = index * (sliceHeight + BAR_GAP);

                // Track: theme foreground at low alpha behind the bar.
                context.setSourceRGBA(fg[0], fg[1], fg[2], 0.15);
                context.rectangle(0, y, width, sliceHeight);
                context.fill();

                const elapsed = this._elapsed[timer.name] ?? 0;
                const limit = this._limitSeconds(timer);
                const overdue = this._isOverdue(timer);
                const fraction = limit > 0 ? Math.min(1, elapsed / limit) : 0;
                const barWidth = overdue ? width : width * fraction;
                if (barWidth <= 0)
                    return;
                const [r, g, b] = hexToRgb(overdue ? timer.overdueColor : timer.color);
                context.setSourceRGBA(r, g, b, 0.95);
                context.rectangle(0, y, barWidth, sliceHeight);
                context.fill();
            });

            context.restore();
            context.$dispose();
        }

        // Called by the panel host when its orientation/rotation changes. When
        // vertical the graph rotates 90° and swaps its actor size so the layout
        // reserves a tall/narrow slot.
        setPanelLayout(info) {
            const vertical = !!(info && info.vertical);
            this._rotated = vertical;
            this._rotateDir =
                info && info.rotation === 'left' ? 'left' : 'right';
            if (vertical) {
                this.width = this._baseHeight;
                this.height = this._baseWidth;
                // Centre the narrow graph in the vertical strip.
                this.x_align = Clutter.ActorAlign.CENTER;
                this.x_expand = true;
            } else {
                this.width = this._baseWidth;
                this.height = this._baseHeight;
                this.x_align = Clutter.ActorAlign.FILL;
            }
            this.queue_repaint();
        }

        destroy() {
            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
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
            super.destroy();
        }
    }
);
