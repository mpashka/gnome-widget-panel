// @ts-nocheck
// @tag:widget-break-timer
//
// The two on-screen stages of a break reminder, driven by the state machine in
// breakTimerState.ts:
//
//   1. a passive message with a live countdown, added to the chrome so it never
//      takes keyboard focus — you can finish the sentence you are typing. The
//      advance warning shows no buttons until it has stepped aside from the
//      pointer once (see _messageOffersActions);
//   2. a dimmed modal break screen covering every monitor, which takes input
//      (so typing cannot leak into applications) but leaves window focus alone:
//      pushModal/popModal restores whatever was focused before it appeared.
//
// Actors are created on first use, so a widget that never reminds anybody costs
// nothing. See ../../../docs/specification/break-timer.md.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {formatClock, formatDuration, stepDuration} from '../../duration.js';
import {
    DAY_END_POSTPONE_MINUTES,
    DAY_END_WRAP_UP_SECONDS,
    MESSAGE_ANCHORS,
    TIMER_TITLES,
    normalizeAnchor,
} from './breakTimerState.js';

const MESSAGE_MARGIN = 64;
const FADE_MS = 200;
// One short flight, not a chase: long enough for the eye to follow, short
// enough not to be in the way of what the user was about to click.
const YIELD_MS = 150;

// The end-of-day window's own free-length stepper: from five minutes to four
// hours. The step itself grows with the value (`stepDuration`), the way every
// other duration in this widget is edited.
const CUSTOM_RANGE = [5 * 60, 4 * 3600];
// "Work until": a time of day moves in quarters of an hour. A ladder that
// jumps by half-hours past three hours is right for "work for two more hours"
// and wrong for "stop at 22:45".
const UNTIL_STEP_SECONDS = 15 * 60;
const UNTIL_MAX_SECONDS = 6 * 3600;


function anchorPosition(anchor, monitor, width, height) {
    const [vertical, horizontal] = anchor.split('-');
    let x = monitor.x + Math.round((monitor.width - width) / 2);
    if (horizontal === 'left')
        x = monitor.x + MESSAGE_MARGIN;
    else if (horizontal === 'right')
        x = monitor.x + monitor.width - width - MESSAGE_MARGIN;
    const y = vertical === 'top'
        ? monitor.y + MESSAGE_MARGIN
        : monitor.y + monitor.height - height - MESSAGE_MARGIN;
    return [Math.round(Math.max(monitor.x, x)), Math.round(Math.max(monitor.y, y))];
}


// Whether a stage-coordinate point falls on an actor.
function isInside(actor, x, y) {
    const [left, top] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return x >= left && x < left + width && y >= top && y < top + height;
}


function timerTitle(timer) {
    return TIMER_TITLES[timer.name] ?? timer.name;
}


function messageText(reminder, timer) {
    const title = timerTitle(timer);
    if (reminder.stage === 'prelude')
        return `${title} in ${Math.max(0, Math.ceil(reminder.remaining))} s`;
    // The daily limit has two thresholds and they mean different things: one
    // says the work is done, the other says the hour is late.
    if (reminder.reason === 'day-end')
        return 'The working day is over — stop for today';
    if (timer.name === 'daily')
        return `${title} reached — call it a day`;
    return `${title} — time to stop`;
}



export class BreakReminderUi {
    // `actions` carries onPostpone/onSkip; the graph turns them into state
    // transitions and syncs back on the next tick. `anchor` is the corner the
    // warning starts in.
    constructor(actions, anchor) {
        this._actions = actions ?? {};
        // Where it appears; once it has yielded it stays where it went, since
        // the pointer showed that its old corner was in the way.
        this._anchor = normalizeAnchor(anchor);
        // Yield state: whether this showing has already stepped aside once, a
        // flight in progress (which _placeMessage must not fight), and a
        // position the user dragged it to (which wins over the anchor).
        this._yielded = false;
        this._yieldArmed = true;
        this._messagePersistent = false;
        this._details = null;
        this._detailsBox = null;
        this._detailsKey = '';
        this._postponeMenu = null;
        this._yielding = false;
        this._dragged = false;
        this._dragOffset = null;
        this._message = null;
        this._messageLabel = null;
        this._messageActions = null;
        this._messageVisible = false;
        // The reminder the message is currently showing, so its action row can
        // be rebuilt after a yield without waiting for the next tick.
        this._messageStage = '';
        this._messageTimer = null;
        this._screen = null;
        this._screenBox = null;
        this._screenTitle = null;
        this._screenTime = null;
        this._screenActions = null;
        this._screenVisible = false;
        this._grab = null;
        this._actionsKey = '';
    }

    /**
     * Render the reminder the state machine currently holds (null hides all).
     * `details` carries the end-of-day numbers — today's keyboard time, the
     * overtime and when the day started — which only the widget can work out.
     */
    sync(reminder, timer, details = null) {
        if (!reminder || !timer) {
            this.hide();
            return;
        }
        this._details = details;
        if (reminder.stage === 'break') {
            this._hideMessage();
            this._showScreen(reminder, timer);
            return;
        }
        this._hideScreen();
        this._showMessage(reminder, timer);
    }

    hide() {
        this._hideMessage();
        this._hideScreen();
    }

    // --- The passive message ------------------------------------------------

    _ensureMessage() {
        if (this._message)
            return;
        this._message = new St.BoxLayout({
            style_class: 'break-timer-message',
            orientation: Clutter.Orientation.VERTICAL,
            visible: false,
            opacity: 0,
            // Reactive so it can notice the pointer coming for it (and be
            // dragged); its buttons need it anyway.
            reactive: true,
            track_hover: true,
        });
        this._message.connect('enter-event', () => this._onMessageEnter());
        this._message.connect('leave-event', () => this._onMessageLeave());
        // Drag to put it wherever the work is not: the dragged position then
        // wins over the anchor for as long as the widget lives. Clutter's
        // implicit pointer grab keeps the motion events coming while the button
        // is held, so no explicit grab (and no modal) is needed — this message
        // must never take the keyboard.
        this._message.connect('button-press-event', (actor, event) =>
            this._onDragPress(event));
        this._message.connect('motion-event', (actor, event) =>
            this._onDragMotion(event));
        this._message.connect('button-release-event', () => this._onDragRelease());
        // Header: an icon (end-of-day only) beside the message text.
        const header = new St.BoxLayout({
            style_class: 'break-timer-message-header',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._messageIcon = new St.Icon({
            icon_name: 'weather-clear-night-symbolic',
            style_class: 'break-timer-message-icon',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._messageIcon);
        this._messageLabel = new St.Label({
            style_class: 'break-timer-message-text',
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._messageLabel);
        this._message.add_child(header);
        // Today's numbers, between the sentence and the answer.
        this._detailsBox = new St.BoxLayout({
            style_class: 'break-timer-details',
            orientation: Clutter.Orientation.VERTICAL,
            visible: false,
        });
        this._message.add_child(this._detailsBox);
        this._messageActions = new St.BoxLayout({
            style_class: 'break-timer-actions',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._message.add_child(this._messageActions);
        // Chrome, not a window: it never takes focus, its input region follows
        // it automatically, and trackFullscreen hides it while a fullscreen
        // window owns the monitor. (Shell 50 accepts only trackFullscreen and
        // affectsStruts here — an unknown key throws.)
        Main.layoutManager.addChrome(this._message, {trackFullscreen: true});
    }

    _showMessage(reminder, timer) {
        this._ensureMessage();
        const firstShowing = !this._messageVisible;
        // A new showing starts unyielded: it may step aside once again — and
        // must do so before its actions are built, or a warning following a
        // yielded one would flash the buttons for a tick.
        if (firstShowing) {
            this._yielded = false;
            this._yieldArmed = true;
        }
        this._messageStage = reminder.stage;
        this._messageTimer = timer;
        // The end-of-day window is the one that stays until it is answered, so
        // it is also the one allowed to step aside more than once.
        this._messagePersistent = reminder.reason === 'day-end';
        this._messageLabel.text = messageText(reminder, timer);
        this._syncMessageDetails();
        this._syncMessageActions();
        this._placeMessage();
        if (!firstShowing)
            return;
        this._messageVisible = true;
        this._message.remove_all_transitions();
        this._message.show();
        this._message.ease({
            opacity: 255,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    // The advance warning carries no buttons until it has stepped aside once.
    // Before that it is a hint about a break that has not begun, and its
    // Postpone/Skip act on nothing one can see yet; they are also unreachable
    // in practice, since the pointer that comes for them makes the message move
    // away first. Once it HAS moved they are both meaningful and clickable, so
    // that is when they appear. The owed-break message ('due') offers them from
    // the start: there the break is already owed.
    _messageOffersActions() {
        // The end-of-day window follows the *warning's* rule, not the owed
        // break's, even though its stage is `due`: it stands for hours, so
        // buttons on the first showing would sit in the path of a pointer that
        // is not coming for them — and the window steps aside from that pointer
        // anyway, which would take them out from under it mid-click.
        if (this._messagePersistent)
            return this._yielded;
        return this._messageStage !== 'prelude' || this._yielded;
    }

    // The three numbers the window argues with, and the only ones it has:
    // today's time at the keyboard, how much of it is past the limit, and when
    // the day began. Today's only — usage history is a non-goal of this widget,
    // and none of it is kept.
    _syncMessageDetails() {
        const details = this._messagePersistent ? this._details : null;
        this._messageIcon.visible = !!details;
        if (!details) {
            this._detailsBox.visible = false;
            this._detailsKey = '';
            return;
        }
        const rows = [
            ['At the keyboard today', formatDuration(details.workedSeconds ?? 0)],
        ];
        if ((details.overtimeSeconds ?? 0) > 0) {
            rows.push([
                `Over your ${formatDuration(details.limitSeconds ?? 0)} limit`,
                `+${formatDuration(details.overtimeSeconds)}`,
            ]);
        }
        if (details.startedLabel)
            rows.push(['Started at', details.startedLabel]);

        // Rebuild only when something actually changed: this runs once a second
        // and the window may be under the pointer.
        const key = rows.map(row => row.join('\u0000')).join('|');
        if (this._detailsKey === key) {
            this._detailsBox.visible = true;
            return;
        }
        this._detailsKey = key;
        this._detailsBox.destroy_all_children();
        for (const [label, value] of rows) {
            const line = new St.BoxLayout({style_class: 'break-timer-details-row'});
            line.add_child(new St.Label({
                text: label,
                style_class: 'break-timer-details-label',
                x_expand: true,
            }));
            line.add_child(new St.Label({
                text: value,
                style_class: 'break-timer-details-value',
            }));
            this._detailsBox.add_child(line);
        }
        this._detailsBox.visible = true;
    }


    _syncMessageActions() {
        if (!this._messageTimer)
            return;
        this._fillActions(
            this._messageActions,
            `message:${this._messageTimer.name}:${this._messageStage}:` +
                `${this._messageOffersActions()}`,
            this._messageTimer,
            this._messageOffersActions()
        );
    }

    // Keep the message on its anchor as the countdown text changes width. A
    // dragged message keeps the place it was put, and a message in mid-flight
    // is left to finish it.
    _placeMessage() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || this._yielding || this._dragged)
            return;
        const [, , width, height] = this._message.get_preferred_size();
        const [x, y] = anchorPosition(this._anchor, monitor, width, height);
        this._message.set_position(x, y);
    }

    // The pointer is coming for the message: step aside **once**, to whichever
    // anchor is furthest from it, and then stay put. A message that keeps
    // fleeing cannot be clicked at all, and constant motion at the edge of the
    // eye is exactly what someone finishing a sentence does not need; one
    // predictable hop frees the screen and leaves Postpone/Skip reachable.
    _onMessageEnter() {
        if (!this._canYield())
            return Clutter.EVENT_PROPAGATE;
        this._yielded = true;
        this._yieldArmed = false;
        this._yieldFromPointer();
        return Clutter.EVENT_PROPAGATE;
    }

    // Who may step aside, and how often. A 30-second message yields **once per
    // showing** — the rule the reminder tests pin down, and the reason its
    // buttons stay under the pointer that came for them. Only the end-of-day
    // window, which stands for hours, may yield again on a later approach.
    _canYield() {
        if (!this._messageVisible || this._dragged)
            return false;
        return this._messagePersistent ? this._yieldArmed : !this._yielded;
    }

    // A 30-second message steps aside once and is gone; the end-of-day window
    // stays up for hours, so freezing it where it first landed would leave it
    // sitting on whatever is underneath for the rest of the evening. It may
    // move again — but only once per approach, so it never flutters while the
    // pointer is on it. Once dragged, the place the user chose wins over both.
    _onMessageLeave() {
        if (this._messagePersistent && !this._dragged)
            this._yieldArmed = true;
        return Clutter.EVENT_PROPAGATE;
    }

    // --- Dragging -----------------------------------------------------------

    // Only the body starts a drag, and the press is never consumed. St.Button
    // recognises its click with a ClutterClickGesture, and a gesture is
    // cancelled as soon as an ancestor answers EVENT_STOP for the same press —
    // an ancestor that swallowed it left Postpone and Skip unclickable
    // altogether, whether or not the message had yielded first.
    //
    // Which press belongs to a button is decided by where it landed rather than
    // by event.get_source(), which is null for events an input device injects.
    _onDragPress(event) {
        const [pointerX, pointerY] = event.get_coords();
        if (event.get_button() !== Clutter.BUTTON_PRIMARY
            || isInside(this._messageActions, pointerX, pointerY))
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = this._message.get_position();
        this._dragOffset = {x: pointerX - x, y: pointerY - y};
        return Clutter.EVENT_PROPAGATE;
    }

    _onDragMotion(event) {
        if (!this._dragOffset)
            return Clutter.EVENT_PROPAGATE;
        const [pointerX, pointerY] = event.get_coords();
        this._message.set_position(
            Math.round(pointerX - this._dragOffset.x),
            Math.round(pointerY - this._dragOffset.y)
        );
        // Moved by hand: the anchor no longer decides where it sits.
        this._dragged = true;
        return Clutter.EVENT_STOP;
    }

    // Same rule as the press: a release the drag did not ask for stays the
    // button's business.
    _onDragRelease() {
        if (!this._dragOffset)
            return Clutter.EVENT_PROPAGATE;
        this._dragOffset = null;
        return Clutter.EVENT_STOP;
    }

    _yieldFromPointer() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const [pointerX, pointerY] = global.get_pointer();
        const [, , width, height] = this._message.get_preferred_size();
        let best = null;
        for (const anchor of MESSAGE_ANCHORS) {
            const [x, y] = anchorPosition(anchor, monitor, width, height);
            const distance = Math.hypot(
                x + width / 2 - pointerX,
                y + height / 2 - pointerY
            );
            if (!best || distance > best.distance)
                best = {anchor, x, y, distance};
        }
        this._anchor = best.anchor;
        this._yielding = true;
        this._message.ease({
            x: best.x,
            y: best.y,
            duration: YIELD_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._yielding = false;
                // It has moved: the warning's actions appear now, and only now
                // — after the flight, so the box does not grow mid-air and land
                // off its anchor.
                this._syncMessageActions();
                this._placeMessage();
            },
        });
    }

    _hideMessage() {
        if (!this._message || !this._messageVisible)
            return;
        this._messageVisible = false;
        this._message.remove_all_transitions();
        this._message.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._messageVisible && this._message)
                    this._message.hide();
            },
        });
    }

    // --- The break screen ---------------------------------------------------

    _ensureScreen() {
        if (this._screen)
            return;
        this._screen = new St.Widget({
            style_class: 'break-timer-screen',
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            can_focus: true,
            visible: false,
            opacity: 0,
        });
        this._screenBox = new St.BoxLayout({
            style_class: 'break-timer-screen-content',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._screenTitle = new St.Label({
            style_class: 'break-timer-screen-title',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._screenTime = new St.Label({
            style_class: 'break-timer-screen-time',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._screenActions = new St.BoxLayout({
            style_class: 'break-timer-actions',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._screenBox.add_child(this._screenTitle);
        this._screenBox.add_child(this._screenTime);
        this._screenBox.add_child(this._screenActions);
        this._screen.add_child(this._screenBox);
        this._screen.connect('key-press-event', (actor, event) => this._onKeyPress(event));
        Main.layoutManager.modalDialogGroup.add_child(this._screen);
    }

    _showScreen(reminder, timer) {
        this._ensureScreen();
        this._screenTitle.text = timerTitle(timer);
        this._screenTime.text = formatDuration(reminder.remaining);
        this._fillActions(this._screenActions, `screen:${timer.name}`, timer);
        this._timer = timer;
        this._fitScreen();
        if (this._screenVisible)
            return;
        this._screenVisible = true;
        this._screen.remove_all_transitions();
        this._screen.show();
        this._takeGrab();
        this._screen.ease({
            opacity: 255,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    // The overlay spans the whole stage (every monitor); the content sits in the
    // middle of the primary one.
    _fitScreen() {
        this._screen.set_position(0, 0);
        this._screen.set_size(global.stage.width, global.stage.height);
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const [, , boxWidth, boxHeight] = this._screenBox.get_preferred_size();
        this._screenBox.set_position(
            Math.round(monitor.x + Math.max(0, (monitor.width - boxWidth) / 2)),
            Math.round(monitor.y + Math.max(0, (monitor.height - boxHeight) / 2))
        );
    }

    _hideScreen() {
        if (!this._screen || !this._screenVisible)
            return;
        this._screenVisible = false;
        this._releaseGrab();
        this._screen.remove_all_transitions();
        this._screen.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._screenVisible && this._screen)
                    this._screen.hide();
            },
        });
    }

    // Input grab only: pushModal remembers the focused window and popModal gives
    // the focus back, so the break costs no place in the session.
    _takeGrab() {
        try {
            this._grab = Main.pushModal(this._screen, {
                actionMode: Shell.ActionMode.SYSTEM_MODAL,
            });
            // Tells the shell a system modal is up, the way ModalDialog does,
            // so the overview and input methods stand aside.
            Main.layoutManager.emit('system-modal-opened');
        } catch (error) {
            // Another grab holds the seat: the dimmed screen still shows, it
            // just cannot stop the keyboard.
            logError(error, 'break-timer: could not grab input for the break screen');
        }
    }

    _releaseGrab() {
        if (!this._grab)
            return;
        try {
            Main.popModal(this._grab);
        } catch (error) {
            logError(error, 'break-timer: could not release the break screen grab');
        }
        this._grab = null;
    }

    _onKeyPress(event) {
        if (event.get_key_symbol() !== Clutter.KEY_Escape)
            return Clutter.EVENT_STOP;
        if (this._timer?.allowPostpone)
            this._actions.onPostpone?.();
        return Clutter.EVENT_STOP;
    }

    // --- Shared -------------------------------------------------------------

    // Rebuild the Postpone/Skip row only when the timer, the stage or whether
    // actions are offered at all changes (all of it carried by `key`), so a
    // once-a-second text update never rebuilds actors under the pointer.
    _fillActions(container, key, timer, offered = true) {
        if (this._actionsKey === key)
            return;
        this._actionsKey = key;
        container.destroy_all_children();
        if (!offered) {
            container.visible = false;
            return;
        }
        if (this._messagePersistent && container === this._messageActions) {
            this._fillDayEndActions(container);
            container.visible = true;
            return;
        }
        if (timer.allowPostpone) {
            container.add_child(this._actionButton(
                `Postpone ${timer.postponeMinutes} min`,
                () => this._actions.onPostpone?.()
            ));
        }
        if (timer.allowSkip) {
            container.add_child(this._actionButton(
                'Skip',
                () => this._actions.onSkip?.()
            ));
        }
        container.visible = container.get_n_children() > 0;
    }

    // One answer, not three. "Wrapping up" is what nine evenings in ten need —
    // ten minutes to close the windows and shut the machine down — and it is
    // named for what the user is doing rather than for brushing the window
    // away, because the cheapest button is the one that teaches the habit. The
    // rest live behind the chevron: same action, different number.
    _fillDayEndActions(container) {
        const split = new St.BoxLayout({style_class: 'break-timer-split'});
        const main = new St.Button({
            style_class: 'button break-timer-action break-timer-split-main',
            label: `Wrapping up — ${formatClock(DAY_END_WRAP_UP_SECONDS)}`,
            can_focus: false,
        });
        main.connect('clicked', () =>
            this._actions.onDayEndPostpone?.(DAY_END_WRAP_UP_SECONDS));
        split.add_child(main);

        const more = new St.Button({
            style_class: 'button break-timer-action break-timer-split-more',
            child: new St.Icon({
                icon_name: 'pan-down-symbolic',
                style_class: 'break-timer-split-arrow',
            }),
            can_focus: false,
        });
        more.connect('clicked', () => this._openPostponeMenu(more));
        split.add_child(more);
        container.add_child(split);
    }


    _openPostponeMenu(source) {
        if (this._postponeMenu) {
            this._postponeMenu.destroy();
            this._postponeMenu = null;
        }
        const menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();
        this._postponeMenu = menu;

        for (const minutes of DAY_END_POSTPONE_MINUTES) {
            const item = new PopupMenu.PopupMenuItem(formatClock(minutes * 60));
            item.connect('activate', () =>
                this._actions.onDayEndPostpone?.(minutes * 60));
            menu.addMenuItem(item);
        }

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        // A length of my own, stepped the way every duration in this widget is
        // stepped: the step grows with the value.
        this._addStepperItem(menu, {
            label: 'Another length…',
            initial: 90 * 60,
            format: seconds => formatClock(seconds),
            step: (seconds, direction) => stepDuration(seconds, direction, CUSTOM_RANGE),
            apply: seconds => this._actions.onDayEndPostpone?.(seconds),
        });
        // A time of day instead of a length. Same operation underneath: the
        // window works out the seconds and postpones by them.
        this._addStepperItem(menu, {
            label: 'Work until…',
            initial: UNTIL_STEP_SECONDS * 2,
            format: seconds => this._clockLabelIn(seconds),
            step: (seconds, direction) => Math.min(
                UNTIL_MAX_SECONDS,
                Math.max(UNTIL_STEP_SECONDS, seconds + direction * UNTIL_STEP_SECONDS)
            ),
            apply: seconds => this._actions.onDayEndPostpone?.(seconds),
        });

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        // Tonight is only tonight: the habitual end of the working day is a
        // decision, and decisions are made in preferences, not at 21:30 by
        // someone who wants the window gone.
        const settings = new PopupMenu.PopupMenuItem('Change my usual end of day…');
        settings.connect('activate', () => this._actions.onOpenPreferences?.());
        menu.addMenuItem(settings);

        menu.open();
    }


    // A menu row that is a stepper, not a choice: [−] value [+] and a tick that
    // commits it. The ± presses must not close the menu, so they are St.Buttons
    // inside the row and the row itself never activates.
    _addStepperItem(menu, {label, initial, format, step, apply}) {
        const item = new PopupMenu.PopupBaseMenuItem({activate: false});
        item.setOrnament(PopupMenu.Ornament.HIDDEN);
        let value = initial;

        item.add_child(new St.Label({
            text: label,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const minus = this._stepButton('list-remove-symbolic');
        const valueLabel = new St.Label({
            text: format(value),
            style_class: 'break-timer-stepper-value',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const plus = this._stepButton('list-add-symbolic');
        const commit = this._stepButton('object-select-symbolic');
        minus.connect('clicked', () => {
            value = step(value, -1);
            valueLabel.text = format(value);
        });
        plus.connect('clicked', () => {
            value = step(value, 1);
            valueLabel.text = format(value);
        });
        commit.connect('clicked', () => {
            menu.close();
            apply(value);
        });
        item.add_child(minus);
        item.add_child(valueLabel);
        item.add_child(plus);
        item.add_child(commit);
        menu.addMenuItem(item);
    }


    _stepButton(iconName) {
        return new St.Button({
            style_class: 'break-timer-stepper-button',
            child: new St.Icon({icon_name: iconName, icon_size: 14}),
            can_focus: false,
        });
    }


    // "Work until 22:45" — the wall-clock time `seconds` from now, so the menu
    // says the thing the user is deciding rather than the arithmetic.
    _clockLabelIn(seconds) {
        const when = GLib.DateTime.new_now_local().add_seconds(seconds);
        return when ? when.format('%H:%M') : formatClock(seconds);
    }


    _actionButton(label, onClick) {
        const button = new St.Button({
            style_class: 'button break-timer-action',
            label,
            can_focus: false,
        });
        button.connect('clicked', () => onClick());
        return button;
    }

    destroy() {
        this._releaseGrab();
        if (this._postponeMenu) {
            this._postponeMenu.destroy();
            this._postponeMenu = null;
        }
        if (this._message) {
            Main.layoutManager.removeChrome(this._message);
            this._message.destroy();
            this._message = null;
        }
        if (this._screen) {
            this._screen.destroy();
            this._screen = null;
        }
        this._messageVisible = false;
        this._screenVisible = false;
    }
}
