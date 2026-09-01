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
import {formatClock, formatDuration} from '../../duration.js';
import {
    INHIBIT_IDLE,
    INHIBIT_SUSPEND,
    SessionInhibitor,
    queryInhibited,
} from '../../sessionInhibitor.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';
import {BreakReminderUi} from './breakTimerReminder.js';
import {
    DEFAULT_DAILY_IDLE_RESET_HOURS,
    advance,
    createState,
    dayEndFraction,
    dayEndRemainingSeconds,
    isDayOver,
    isSilent,
    limitSeconds,
    normalizeAnchor,
    normalizeDayEnd,
    normalizePauseMinutes,
    normalizeTimers,
    pauseFraction,
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
const DEFAULT_TOOLTIP_TEMPLATE = '{micro}\n{rest}\n{daily}\n{dayend}';

// How often the counters reach the disk, and how stale the session-inhibitor
// answer may get. The inhibitor now silences the reminders altogether (not just
// the break screen), so it is polled on every tick at this cadence rather than
// once per break: turning caffeine on shortly before a break must be noticed
// while there is still something to suppress.
const PERSIST_INTERVAL_SECONDS = 30;
const INHIBIT_REFRESH_SECONDS = 10;

// The manual pause offered by the context menu, in seconds. Every choice
// expires on its own: a pause one can forget to end is a timer one has turned
// off by accident. A pause is also a keep-awake: nobody pauses their rest
// reminders and then wants the screen to lock mid-sentence, so the pause holds
// a session inhibitor for exactly as long as it lasts — the caffeine widget's
// gesture, from the other end (see ../../sessionInhibitor.ts).
const PAUSE_APP_ID = 'gnome-widget-panel';
const PAUSE_REASON = 'Break timer paused: keep the screen awake meanwhile';

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
            this._pauseMinutes = normalizePauseMinutes(options.pauseMinutes);
            this._dayEnd = normalizeDayEnd(options);
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
            // The keep-awake the manual pause holds while it lasts.
            this._pauseInhibitor = new SessionInhibitor({
                appId: PAUSE_APP_ID,
                label: 'break-timer',
                onChanged: () => this.queue_repaint(),
            });
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

        // The epoch second of the "stop working" time for the working day that
        // is currently running. Anchored to the day work BEGAN on, not to today:
        // past midnight the deadline that matters is still the one of the day
        // one sat down on, which is by then in the past — as it should be.
        _dayEndAt() {
            if (!this._dayEnd.enabled)
                return 0;
            const anchor = this._state.dayStartedAt > 0
                ? this._state.dayStartedAt
                : nowSeconds();
            try {
                const base = GLib.DateTime.new_from_unix_local(anchor);
                const target = GLib.DateTime.new_local(
                    base.get_year(),
                    base.get_month(),
                    base.get_day_of_month(),
                    Math.floor(this._dayEnd.minutes / 60),
                    this._dayEnd.minutes % 60,
                    0
                );
                return target ? target.to_unix() : 0;
            } catch (error) {
                logError(error, 'break-timer: could not work out the end of the day');
                return 0;
            }
        }

        // Is the working day over, by the clock rather than by the counter?
        _dayOver() {
            return isDayOver({dayEndAt: this._dayEndAt(), now: nowSeconds()});
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
                dayEndAt: this._dayEndAt(),
            };
            this._state = advance(this._state, this._timers, input);
            // The pause ran out inside advance(): hand the screen back with it,
            // or the keep-awake would outlive the pause that asked for it.
            if (this._pauseInhibitor.held &&
                pauseRemainingSeconds(this._state, input.now) === 0)
                this._releasePauseInhibitor();
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
        // fresh on every tick rather than only while a reminder is up. Our own
        // pause inhibitor counts as an inhibitor too, which is exactly right:
        // while it is held the reminders must stay silent.
        _refreshInhibited() {
            const now = nowSeconds();
            if (this._inhibitPending || now - this._inhibitCheckedAt < INHIBIT_REFRESH_SECONDS)
                return;
            this._inhibitCheckedAt = now;
            this._inhibitPending = true;
            queryInhibited(INHIBIT_IDLE, this._cancellable).then((inhibited) => {
                this._inhibitPending = false;
                if (this._destroyed)
                    return;
                this._inhibited = inhibited;
            });
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
            for (const minutes of this._pauseMinutes) {
                this._addMenuItem(
                    menu,
                    `Pause for ${formatClock(minutes * 60)}`,
                    () => this._pause(minutes * 60)
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
            // Pausing the reminders is also asking for the screen to stay: the
            // meeting the pause covers is exactly the moment a lock screen is
            // unwelcome. Released again by _resume, by the pause running out
            // (see the tick) and by destroy().
            this._pauseInhibitor.inhibit(
                PAUSE_REASON,
                INHIBIT_IDLE | INHIBIT_SUSPEND
            );
            this._syncReminder();
            this.queue_repaint();
        }

        _resume() {
            this._state = resumeReminders(this._state);
            this._releasePauseInhibitor();
            this.queue_repaint();
        }

        // Give the screen back and stop claiming the session is inhibited: the
        // polled IsInhibited answer is up to INHIBIT_REFRESH_SECONDS old and,
        // until it is refreshed, still reports our own just-released inhibitor —
        // which would keep the timers silent after the user resumed them.
        _releasePauseInhibitor() {
            this._pauseInhibitor.release();
            this._inhibited = false;
            this._inhibitCheckedAt = 0;
            this._silent = false;
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

        // Overdue by either of the daily limit's two thresholds: the work done,
        // or the time of day.
        _isOverdue(timer) {
            const limit = limitSeconds(timer);
            if (limit > 0 && (this._state.elapsed[timer.name] ?? 0) >= limit)
                return true;
            return timer.name === 'daily' && this._dayOver();
        }

        // How full a timer's bar is. The daily bar answers to two thresholds and
        // shows the one that is further along — whichever will be reached first
        // is the one worth watching.
        _fractionFor(timer) {
            const limit = limitSeconds(timer);
            const elapsed = this._state.elapsed[timer.name] ?? 0;
            const byWork = limit > 0 ? Math.min(1, elapsed / limit) : 0;
            if (timer.name !== 'daily')
                return byWork;
            const byClock = dayEndFraction(this._state, {
                dayEndAt: this._dayEndAt(),
                now: nowSeconds(),
            });
            return Math.max(byWork, byClock);
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

        // The end-of-day token: how much of the working day is left, and which
        // of the daily limit's two thresholds will be reached first. Empty when
        // the limit is switched off, so its template line collapses.
        _dayEndFragment() {
            const dayEndAt = this._dayEndAt();
            if (!dayEndAt)
                return '';
            const daily = this._timers.find(timer => timer.name === 'daily');
            const at = formatClock(this._dayEnd.minutes * 60);
            if (this._dayOver()) {
                const color = daily?.overdueColor ?? '#f03333';
                return `<span foreground="${color}">day over (${at}) — stop</span>`;
            }
            const now = nowSeconds();
            const left = dayEndRemainingSeconds({dayEndAt, now});
            // "first" is the honest word for whichever threshold the bar is
            // drawing: the one whose share is further along.
            const byClock = dayEndFraction(this._state, {dayEndAt, now});
            const byWork = daily && limitSeconds(daily) > 0
                ? Math.min(1, (this._state.elapsed.daily ?? 0) / limitSeconds(daily))
                : 0;
            const suffix = byClock >= byWork ? ' — first' : '';
            const color = daily?.color ?? '#ffb82e';
            return `<span foreground="${color}">until ${at}: `
                + `${formatDuration(left)} left${suffix}</span>`;
        }

        _tooltipFragments() {
            const fragments = {};
            for (const timer of this._timers)
                fragments[timer.name] = this._timerFragment(timer);
            fragments.dayend = this._dayEndFragment();
            return fragments;
        }

        // Why the timers are quiet, above the per-timer lines: the tooltip is
        // the only place the pause is written out in full, and a paused timer
        // that looks like a running one is a trap.
        _statusFragment() {
            const remaining = pauseRemainingSeconds(this._state, nowSeconds());
            if (remaining > 0) {
                const awake = this._pauseInhibitor.held
                    ? ', screen kept awake'
                    : '';
                return `<i>Paused — ${formatDuration(remaining)} left${awake}</i>`;
            }
            if (this._inhibited)
                return '<i>Silent — the screen is kept awake</i>';
            return '';
        }

        _tooltipMarkup() {
            const body = renderTemplate(this._template, this._tooltipFragments());
            const status = this._statusFragment();
            const markup = status ? `${status}\n${body}` : body;
            // A token that renders empty (a disabled timer, the end-of-day limit
            // switched off) would otherwise leave its blank line behind.
            return markup
                .split('\n')
                .filter(line => line.trim().length > 0)
                .join('\n');
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

            // Paused: one glance must say "not counting, and the screen is
            // staying on" — a cup and how much of the pause is left, instead of
            // three bars whose numbers nobody is watching right now.
            if (pauseRemainingSeconds(this._state, nowSeconds()) > 0) {
                this._drawPaused(context, width, height, fg);
                context.restore();
                context.$dispose();
                return;
            }

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

                const overdue = this._isOverdue(timer);
                const barWidth = overdue ? width : width * this._fractionFor(timer);
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

        // The paused face: a coffee cup filling the left square of the widget,
        // and one bar for the rest of it showing how much of the pause is left.
        // Drawn rather than themed, so it needs no icon from the icon theme and
        // scales with whatever size the panel gives the widget.
        _drawPaused(context, width, height, fg) {
            const cup = Math.min(height, width);
            this._drawCup(context, cup, fg);

            const barX = cup + BAR_GAP * 2;
            const barWidth = Math.max(0, width - barX);
            if (barWidth <= 0)
                return;
            const barHeight = Math.max(2, Math.round(height / 3));
            const barY = (height - barHeight) / 2;

            context.setSourceRGBA(fg[0], fg[1], fg[2], 0.15);
            context.rectangle(barX, barY, barWidth, barHeight);
            context.fill();

            const left = pauseFraction(this._state, nowSeconds());
            if (left <= 0)
                return;
            context.setSourceRGBA(fg[0], fg[1], fg[2], SILENT_BAR_ALPHA + 0.25);
            context.rectangle(barX, barY, barWidth * left, barHeight);
            context.fill();
        }

        // A cup in `size` x `size` pixels: body, handle, and steam above it. Kept
        // to plain strokes and fills so it stays legible at the 16 px the panel
        // usually gives it.
        _drawCup(context, size, fg) {
            const unit = size / 16;
            const alpha = SILENT_BAR_ALPHA + 0.45;
            context.setSourceRGBA(fg[0], fg[1], fg[2], alpha);
            context.setLineWidth(Math.max(1, unit));

            // Body: a slightly tapered cup standing on the bottom edge.
            const left = 2 * unit;
            const right = 11 * unit;
            const top = 7 * unit;
            const bottom = 14 * unit;
            context.moveTo(left, top);
            context.lineTo(right, top);
            context.lineTo(right - unit, bottom);
            context.lineTo(left + unit, bottom);
            context.closePath();
            context.fill();

            // Handle on the right of the body.
            context.arc(right, (top + bottom) / 2, 2.5 * unit, -Math.PI / 2, Math.PI / 2);
            context.stroke();

            // Two curls of steam, so the cup reads as a hot drink and not a bin.
            for (const x of [4.5 * unit, 8 * unit]) {
                context.moveTo(x, 5.5 * unit);
                context.curveTo(x + unit, 4 * unit, x - unit, 3 * unit, x, 1.5 * unit);
                context.stroke();
            }
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
            // Before the cancellable is cancelled: the inhibitor releases its
            // cookie through a fresh call, and GDBus short-circuits a call made
            // with an already-cancelled cancellable — which would leave the
            // screen awake with nobody left to release it. The inhibitor has its
            // own cancellable for a reply still in flight.
            this._pauseInhibitor.destroy();
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
