// @ts-nocheck
// @tag:widget-break-timer
//
// Workrave-style rest reminders: an St.DrawingArea painting up to three stacked
// progress bars (micro/rest/daily), each tracking activity time (not wall-clock
// time) against a per-timer work interval, plus the reminders those timers
// raise. This file is the Shell-facing half — idle polling, suppression checks,
// persistence cadence, Cairo drawing and the hover tooltip; the rules live in
// the gi-free breakTimerState.ts and the on-screen stages in
// breakTimerReminder.ts. See index.md.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {hexToRgb, nowSeconds, toNumber} from '../../colorUtils.js';
import {formatDuration} from '../../duration.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';
import {BreakReminderUi} from './breakTimerReminder.js';
import {
    DEFAULT_DAILY_IDLE_RESET_HOURS,
    advance,
    createState,
    isSilent,
    limitSeconds,
    normalizeAnchor,
    normalizeTimers,
    pauseRemainingSeconds,
    pauseReminders,
    postponeReminder,
    restoreElapsed,
    resumeReminders,
    serializeState,
    skipReminder,
} from './breakTimerState.js';
import {loadStoredState, readBootId, saveStoredState} from './breakTimerStore.js';

const WIDTH = 32;
const HEIGHT = 16;
const TICK_INTERVAL_SECONDS = 1;
const BAR_GAP = 1;

// Default hover-tooltip template. Tokens: {micro}, {rest}, {daily}, each a
// coloured `name: elapsed/limit` Pango fragment (empty when the timer is
// disabled). See ../../tooltipTemplate.ts.
const DEFAULT_TOOLTIP_TEMPLATE = '{micro}\n{rest}\n{daily}';

// How often the counters reach the disk, and how stale the session-inhibitor
// answer may get. The inhibitor now silences the reminders altogether (not just
// the break screen), so it is polled on every tick at this cadence rather than
// once per break: turning caffeine on shortly before a break must be noticed
// while there is still something to suppress.
const PERSIST_INTERVAL_SECONDS = 30;
const INHIBIT_REFRESH_SECONDS = 10;

// org.gnome.SessionManager.IsInhibited(4): is anything holding the session
// awake right now (a call, a video, the panel's own caffeine widget)? If so
// every reminder stays silent — see the `inhibited` input of advance().
const SESSION_BUS_NAME = 'org.gnome.SessionManager';
const SESSION_OBJECT_PATH = '/org/gnome/SessionManager';
const SESSION_IFACE_NAME = 'org.gnome.SessionManager';
const FLAG_INHIBIT_IDLE = 4;

// The manual pause offered by the context menu, in seconds. Every choice
// expires on its own: a pause one can forget to end is a timer one has turned
// off by accident.
const PAUSE_CHOICES = [
    {label: 'Pause for 15 minutes', seconds: 15 * 60},
    {label: 'Pause for 1 hour', seconds: 60 * 60},
    {label: 'Pause for 2 hours', seconds: 2 * 60 * 60},
];

// Bar opacity while the reminders are silent (paused or something keeps the
// session awake): the counters still run, so the bars stay — dimmed.
const SILENT_BAR_ALPHA = 0.3;
const ACTIVE_BAR_ALPHA = 0.95;



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
            this._dailyIdleResetSeconds = Math.max(0, Math.round(
                toNumber(options.dailyResetHours, DEFAULT_DAILY_IDLE_RESET_HOURS) * 3600
            ));
            this._messageAnchor = normalizeAnchor(options.messageAnchor);
            this._showTooltip = options.showTooltip !== false;
            this._template = typeof options.template === 'string'
                ? options.template
                : DEFAULT_TOOLTIP_TEMPLATE;

            this._state = createState();
            this._reminderUi = null;
            this._menu = null;
            this._destroyed = false;
            this._cancellable = new Gio.Cancellable();
            // Reminders silenced right now, by the manual pause or by something
            // holding the session awake. Drawn dimmed, reported in the tooltip.
            this._silent = false;
            this._inhibited = false;
            this._inhibitPending = false;
            this._inhibitCheckedAt = 0;
            this._persistedAt = nowSeconds();
            this._bootId = null;

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
            this._pressId = this.connect(
                'button-press-event',
                (actor, event) => this._onButtonPress(event)
            );
            this._timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                TICK_INTERVAL_SECONDS,
                () => {
                    this._tick();
                    return GLib.SOURCE_CONTINUE;
                }
            );
            this._restore();
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
            const idleSeconds = this._readIdleMs() / 1000;
            this._refreshInhibited();
            const input = {
                idleSeconds,
                tickSeconds: TICK_INTERVAL_SECONDS,
                canInterrupt: this._canInterrupt(),
                inhibited: this._inhibited,
                now: nowSeconds(),
                dailyIdleResetSeconds: this._dailyIdleResetSeconds,
            };
            this._state = advance(this._state, this._timers, input);
            this._silent = isSilent(this._state, input);
            this._syncReminder();
            this._persistPeriodically();

            if (this.hover)
                this._updateTooltip();
            this.queue_repaint();
        }

        // --- Reminders ------------------------------------------------------

        _ensureReminderUi() {
            if (!this._reminderUi) {
                this._reminderUi = new BreakReminderUi(
                    {
                        onPostpone: () => this._postpone(),
                        onSkip: () => this._skip(),
                    },
                    this._messageAnchor
                );
            }
            return this._reminderUi;
        }

        _postpone() {
            this._state = postponeReminder(this._state, this._timers);
            this._syncReminder();
        }

        _skip() {
            this._state = skipReminder(this._state, this._timers);
            this._syncReminder();
        }

        _syncReminder() {
            const reminder = this._state.reminder;
            if (!reminder) {
                this._reminderUi?.hide();
                return;
            }
            const timer = this._timers.find(entry => entry.name === reminder.timer);
            this._ensureReminderUi().sync(reminder, timer);
        }

        // Would a break *screen* right now do harm? A locked session or a
        // fullscreen window (a film, a presentation, a shared screen) says yes;
        // the break degrades to the passive message. A session inhibitor is a
        // separate, stronger answer — it silences both stages — and is fed to
        // advance() as `inhibited` rather than mixed in here.
        _canInterrupt() {
            try {
                if (Main.sessionMode?.isLocked)
                    return false;
                const monitors = Main.layoutManager?.monitors?.length ?? 0;
                for (let index = 0; index < monitors; index++) {
                    if (global.display.get_monitor_in_fullscreen(index))
                        return false;
                }
            } catch (error) {
                // Shell internals moved: assume interrupting is fine.
            }
            return true;
        }

        // Asynchronous IsInhibited(), at most once every INHIBIT_REFRESH_SECONDS:
        // the answer decides whether the timers may speak at all, so it is kept
        // fresh on every tick rather than only while a reminder is up.
        _refreshInhibited() {
            const now = nowSeconds();
            if (this._inhibitPending || now - this._inhibitCheckedAt < INHIBIT_REFRESH_SECONDS)
                return;
            this._inhibitCheckedAt = now;
            this._inhibitPending = true;
            try {
                Gio.DBus.session.call(
                    SESSION_BUS_NAME,
                    SESSION_OBJECT_PATH,
                    SESSION_IFACE_NAME,
                    'IsInhibited',
                    new GLib.Variant('(u)', [FLAG_INHIBIT_IDLE]),
                    new GLib.VariantType('(b)'),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    this._cancellable,
                    (connection, result) => {
                        this._inhibitPending = false;
                        if (this._destroyed)
                            return;
                        try {
                            const [inhibited] = connection.call_finish(result).deep_unpack();
                            this._inhibited = inhibited;
                        } catch (error) {
                            // No session manager, or the call was cancelled:
                            // assume nothing is inhibiting.
                            this._inhibited = false;
                        }
                    }
                );
            } catch (error) {
                this._inhibitPending = false;
                this._inhibited = false;
            }
        }

        // --- Context menu ---------------------------------------------------

        // Right-click opens the actions the on-screen reminder cannot always
        // offer: postponing or skipping the break that is up, and the manual
        // pause for a meeting. The panel button itself is a stable target — it
        // never moves out from under the pointer the way the message does.
        _onButtonPress(event) {
            if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;
            this._openMenu();
            return Clutter.EVENT_STOP;
        }

        _ensureMenu() {
            if (this._menu)
                return this._menu;
            this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            Main.uiGroup.add_child(this._menu.actor);
            Main.panel.menuManager?.addMenu(this._menu);
            this._menu.actor.hide();
            return this._menu;
        }

        _addMenuItem(menu, label, onActivate) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => onActivate());
            menu.addMenuItem(item);
        }

        // Rebuilt on every open: what it offers depends on the reminder that is
        // up and on whether the timers are paused.
        _fillMenu(menu) {
            menu.removeAll();
            const reminder = this._state.reminder;
            const timer = reminder
                ? this._timers.find(entry => entry.name === reminder.timer)
                : null;
            if (timer?.allowPostpone) {
                this._addMenuItem(
                    menu,
                    `Postpone ${timer.postponeMinutes} min`,
                    () => this._postpone()
                );
            }
            if (timer?.allowSkip)
                this._addMenuItem(menu, 'Skip the break', () => this._skip());
            if (menu.numMenuItems > 0)
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const remaining = pauseRemainingSeconds(this._state, nowSeconds());
            if (remaining > 0) {
                this._addMenuItem(
                    menu,
                    `Resume (${formatDuration(remaining)} left)`,
                    () => this._resume()
                );
                return;
            }
            for (const choice of PAUSE_CHOICES) {
                this._addMenuItem(
                    menu,
                    choice.label,
                    () => this._pause(choice.seconds)
                );
            }
            // Not an action, an explanation: caffeine (or any other inhibitor)
            // already silences the timers, so a pause would change nothing.
            if (this._inhibited) {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                menu.addMenuItem(new PopupMenu.PopupMenuItem(
                    'Silent: the screen is being kept awake',
                    {reactive: false}
                ));
            }
        }

        _openMenu() {
            const menu = this._ensureMenu();
            this._fillMenu(menu);
            menu.open();
        }

        _pause(seconds) {
            this._state = pauseReminders(this._state, seconds, nowSeconds());
            this._silent = true;
            this._syncReminder();
            this.queue_repaint();
        }

        _resume() {
            this._state = resumeReminders(this._state);
            this._silent = this._inhibited;
            this.queue_repaint();
        }

        // --- Persistence ----------------------------------------------------

        async _restore() {
            try {
                const bootId = await readBootId();
                const stored = await loadStoredState();
                if (this._destroyed)
                    return;
                this._bootId = bootId;
                this._state.elapsed = restoreElapsed(stored, this._timers, {
                    bootId,
                    now: nowSeconds(),
                    dailyIdleResetSeconds: this._dailyIdleResetSeconds,
                });
                this.queue_repaint();
            } catch (error) {
                logError(error, 'break-timer: could not restore the counters');
            }
        }

        _persistPeriodically() {
            const now = nowSeconds();
            if (this._bootId === null || now - this._persistedAt < PERSIST_INTERVAL_SECONDS)
                return;
            this._persistedAt = now;
            this._persist();
        }

        // Fire and forget: a lost write costs at most the last half minute of
        // counting, and destroy() cannot await.
        _persist() {
            if (this._bootId === null)
                return;
            const stored = serializeState(this._state, {
                bootId: this._bootId,
                now: nowSeconds(),
            });
            saveStoredState(stored).catch(error =>
                logError(error, 'break-timer: could not save the counters'));
        }

        // --- Tooltip --------------------------------------------------------

        _isOverdue(timer) {
            const limit = limitSeconds(timer);
            return limit > 0 && (this._state.elapsed[timer.name] ?? 0) >= limit;
        }

        // Build the coloured Pango-markup fragment for one timer's tooltip token;
        // empty for a disabled timer so the template line collapses.
        _timerFragment(timer) {
            if (!timer.enabled)
                return '';
            const elapsed = this._state.elapsed[timer.name] ?? 0;
            const limit = limitSeconds(timer);
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

        // Why the timers are quiet, above the per-timer lines: the tooltip is
        // the only place the pause is written out in full, and a paused timer
        // that looks like a running one is a trap.
        _statusFragment() {
            const remaining = pauseRemainingSeconds(this._state, nowSeconds());
            if (remaining > 0)
                return `<i>Paused — ${formatDuration(remaining)} left</i>`;
            if (this._inhibited)
                return '<i>Silent — the screen is kept awake</i>';
            return '';
        }

        _tooltipMarkup() {
            const body = renderTemplate(this._template, this._tooltipFragments());
            const status = this._statusFragment();
            return status ? `${status}\n${body}` : body;
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

        // --- Drawing --------------------------------------------------------

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

                const elapsed = this._state.elapsed[timer.name] ?? 0;
                const limit = limitSeconds(timer);
                const overdue = this._isOverdue(timer);
                const fraction = limit > 0 ? Math.min(1, elapsed / limit) : 0;
                const barWidth = overdue ? width : width * fraction;
                if (barWidth <= 0)
                    return;
                const [r, g, b] = hexToRgb(overdue ? timer.overdueColor : timer.color);
                context.setSourceRGBA(
                    r, g, b,
                    this._silent ? SILENT_BAR_ALPHA : ACTIVE_BAR_ALPHA
                );
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
            this._destroyed = true;
            this._persist();
            this._cancellable.cancel();
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
            if (this._pressId) {
                this.disconnect(this._pressId);
                this._pressId = null;
            }
            if (this._menu) {
                this._menu.destroy();
                this._menu = null;
            }
            if (this._reminderUi) {
                this._reminderUi.destroy();
                this._reminderUi = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            super.destroy();
        }
    }
);
