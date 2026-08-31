// @ts-nocheck
// @tag:widget-break-timer
//
// The two on-screen stages of a break reminder, driven by the state machine in
// breakTimerState.ts:
//
//   1. a passive message with a live countdown, added to the chrome so it never
//      takes keyboard focus — you can finish the sentence you are typing;
//   2. a dimmed modal break screen covering every monitor, which takes input
//      (so typing cannot leak into applications) but leaves window focus alone:
//      pushModal/popModal restores whatever was focused before it appeared.
//
// Actors are created on first use, so a widget that never reminds anybody costs
// nothing. See ../../../docs/specification/break-timer.md.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {formatDuration} from '../../duration.js';
import {MESSAGE_ANCHORS, TIMER_TITLES, normalizeAnchor} from './breakTimerState.js';

const MESSAGE_MARGIN = 64;
const FADE_MS = 200;
// One short flight, not a chase: long enough for the eye to follow, short
// enough not to be in the way of what the user was about to click.
const YIELD_MS = 150;


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


function timerTitle(timer) {
    return TIMER_TITLES[timer.name] ?? timer.name;
}


function messageText(reminder, timer) {
    const title = timerTitle(timer);
    if (reminder.stage === 'prelude')
        return `${title} in ${Math.max(0, Math.ceil(reminder.remaining))} s`;
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
        this._yielding = false;
        this._dragged = false;
        this._dragOffset = null;
        this._message = null;
        this._messageLabel = null;
        this._messageActions = null;
        this._messageVisible = false;
        this._screen = null;
        this._screenBox = null;
        this._screenTitle = null;
        this._screenTime = null;
        this._screenActions = null;
        this._screenVisible = false;
        this._grab = null;
        this._actionsKey = '';
    }

    /** Render the reminder the state machine currently holds (null hides all). */
    sync(reminder, timer) {
        if (!reminder || !timer) {
            this.hide();
            return;
        }
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
        this._messageLabel = new St.Label({
            style_class: 'break-timer-message-text',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._message.add_child(this._messageLabel);
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
        this._messageLabel.text = messageText(reminder, timer);
        this._fillActions(this._messageActions, `message:${timer.name}:${reminder.stage}`, timer);
        this._placeMessage();
        if (this._messageVisible)
            return;
        this._messageVisible = true;
        // A new showing starts unyielded: it may step aside once again.
        this._yielded = false;
        this._message.remove_all_transitions();
        this._message.show();
        this._message.ease({
            opacity: 255,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
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
        if (this._yielded || !this._messageVisible || this._dragged)
            return Clutter.EVENT_PROPAGATE;
        this._yielded = true;
        this._yieldFromPointer();
        return Clutter.EVENT_PROPAGATE;
    }

    // --- Dragging -----------------------------------------------------------

    _onDragPress(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const [pointerX, pointerY] = event.get_coords();
        const [x, y] = this._message.get_position();
        this._dragOffset = {x: pointerX - x, y: pointerY - y};
        return Clutter.EVENT_STOP;
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

    _onDragRelease() {
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

    // Rebuild the Postpone/Skip row only when the timer or stage changes, so a
    // once-a-second text update never rebuilds actors under the pointer.
    _fillActions(container, key, timer) {
        if (this._actionsKey === key)
            return;
        this._actionsKey = key;
        container.destroy_all_children();
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
