// @ts-nocheck
// @tag:widget-caffeine
//
// Panel toggle button that manually inhibits the screensaver/suspend via
// org.gnome.SessionManager's Inhibit/Uninhibit D-Bus methods. Useful during
// calls: native clients (e.g. Zoom on Wayland) often fail to inhibit idle
// themselves, unlike web clients that inhibit through the browser's portal.
// A right click keeps the session awake for a fixed time instead of
// indefinitely; the same inhibitor also silences the break-timer widget's
// reminders (it reads IsInhibited), so one gesture covers a whole meeting.
// See index.md for the motivation and D-Bus details.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {nowSeconds} from '../../colorUtils.js';
import {formatDuration} from '../../duration.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {buildButtonContent} from '../panelButtonContent.js';

// Inactive-state default: the screensaver icon (screensaver/suspend behave
// normally). Active state always shows ACTIVE_ICON regardless of user
// customization, so the "awake" state is unmistakable. Both names verified
// present under /usr/share/icons/Adwaita/symbolic (see index.md).
const DEFAULTS = {
    icon: 'preferences-desktop-screensaver-symbolic',
    text: '',
};
const ACTIVE_ICON = 'display-brightness-symbolic';

const BUS_NAME = 'org.gnome.SessionManager';
const OBJECT_PATH = '/org/gnome/SessionManager';
const IFACE_NAME = 'org.gnome.SessionManager';
const APP_ID = 'gnome-widget-panel';
const REASON = 'Manual caffeine: keep screen awake during a call';

// org.gnome.SessionManager Inhibit flags: 4 = inhibit the session being
// marked idle (screensaver), 8 = inhibit suspending the session. 4 | 8 = 12
// inhibits both; with `inhibitSuspend: false` only flag 4 is requested.
const FLAG_INHIBIT_IDLE = 4;
const FLAG_INHIBIT_SUSPEND = 8;

// Right-click durations. A meeting ends; an inhibitor that outlives it is how a
// laptop spends the night with its screen on, so every timed choice expires by
// itself. "Until turned off" stays available as the plain left-click behaviour.
const AWAKE_CHOICES = [
    {label: 'Keep awake for 15 minutes', seconds: 15 * 60},
    {label: 'Keep awake for 30 minutes', seconds: 30 * 60},
    {label: 'Keep awake for 1 hour', seconds: 60 * 60},
    {label: 'Keep awake for 2 hours', seconds: 2 * 60 * 60},
];

const CaffeineButton = GObject.registerClass(
    class CaffeineButton extends St.Button {
        _init(options) {
            this._options = options;
            this._cookie = null;
            this._pending = false;
            this._destroyed = false;
            this._cancellable = new Gio.Cancellable();
            // Wall-clock second the timed keep-awake ends at; 0 = until the
            // button is switched off again.
            this._deadline = 0;
            this._expiryId = null;
            this._tooltipTickId = null;
            this._menu = null;

            super._init({
                style_class: 'button ctlBtn',
                reactive: true,
                track_hover: true,
                can_focus: true,
                child: buildButtonContent(options, DEFAULTS),
            });

            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            Main.uiGroup.add_child(this._tooltip);

            this.connect('clicked', () => this._onClicked());
            this.connect('button-press-event', (actor, event) => {
                if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                    return Clutter.EVENT_PROPAGATE;
                this._openMenu();
                return Clutter.EVENT_STOP;
            });
            this.connect('notify::hover', () => this._onHoverChanged());
        }

        _inhibitFlags() {
            return this._options.inhibitSuspend === false
                ? FLAG_INHIBIT_IDLE
                : FLAG_INHIBIT_IDLE | FLAG_INHIBIT_SUSPEND;
        }

        // Rebuild the button child for the given active state and toggle the
        // 'checked' pseudo-class used for styling.
        _applyVisualState(active) {
            try {
                const content = active
                    ? buildButtonContent({...this._options, icon: ACTIVE_ICON}, DEFAULTS)
                    : buildButtonContent(this._options, DEFAULTS);
                this.set_child(content);
                if (active)
                    this.add_style_pseudo_class('checked');
                else
                    this.remove_style_pseudo_class('checked');
                this._updateTooltip();
            } catch (error) {
                logError(error, 'caffeine: failed to update visual state');
            }
        }

        _onClicked() {
            try {
                if (this._pending)
                    return;
                if (this._cookie !== null)
                    this._turnOff();
                else
                    this._keepAwakeFor(0);
            } catch (error) {
                logError(error, 'caffeine: click handler failed');
            }
        }

        // --- Timed keep-awake -----------------------------------------------

        // `seconds` 0 keeps the session awake until the button is switched off
        // again (the plain left click); anything else expires on its own.
        // Choosing a duration while already active only moves the deadline —
        // the inhibitor cookie in hand stays valid.
        _keepAwakeFor(seconds) {
            this._setDeadline(seconds > 0 ? nowSeconds() + seconds : 0);
            if (this._cookie === null && !this._pending)
                this._inhibit();
            else
                this._updateTooltip();
        }

        _turnOff() {
            this._setDeadline(0);
            this._uninhibit(false);
            this._updateTooltip();
        }

        _setDeadline(deadline) {
            if (this._expiryId) {
                GLib.Source.remove(this._expiryId);
                this._expiryId = null;
            }
            this._deadline = deadline;
            if (deadline <= 0)
                return;
            const delay = Math.max(1, Math.round(deadline - nowSeconds()));
            this._expiryId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                delay,
                () => {
                    this._expiryId = null;
                    this._deadline = 0;
                    this._uninhibit(false);
                    this._updateTooltip();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        _remainingSeconds() {
            return this._deadline > 0
                ? Math.max(0, this._deadline - nowSeconds())
                : 0;
        }

        // --- Menu -------------------------------------------------------------

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

        _openMenu() {
            const menu = this._ensureMenu();
            menu.removeAll();
            if (this._cookie !== null) {
                const remaining = this._remainingSeconds();
                this._addMenuItem(
                    menu,
                    remaining > 0
                        ? `Turn off (${formatDuration(remaining)} left)`
                        : 'Turn off',
                    () => this._turnOff()
                );
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
            for (const choice of AWAKE_CHOICES) {
                this._addMenuItem(
                    menu,
                    choice.label,
                    () => this._keepAwakeFor(choice.seconds)
                );
            }
            this._addMenuItem(
                menu,
                'Keep awake until turned off',
                () => this._keepAwakeFor(0)
            );
            menu.open();
        }

        // --- Tooltip ----------------------------------------------------------

        _tooltipText() {
            if (this._cookie === null)
                return 'Screen and suspend behave normally';
            const remaining = this._remainingSeconds();
            return remaining > 0
                ? `Keeping awake — ${formatDuration(remaining)} left`
                : 'Keeping awake until turned off';
        }

        _updateTooltip() {
            if (!this._tooltip)
                return;
            this._tooltip.text = this._tooltipText();
            if (this._tooltip.visible)
                positionTooltip(this);
        }

        // The remaining time only needs to tick while it is being read.
        _onHoverChanged() {
            if (this.hover) {
                this._updateTooltip();
                positionTooltip(this);
                animateTooltipVisibility(this, true);
                this._tooltipTickId ??= GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    1,
                    () => {
                        this._updateTooltip();
                        return GLib.SOURCE_CONTINUE;
                    }
                );
                return;
            }
            animateTooltipVisibility(this, false);
            if (this._tooltipTickId) {
                GLib.Source.remove(this._tooltipTickId);
                this._tooltipTickId = null;
            }
        }

        // Async Inhibit() call. The button only shows "active" once a cookie is
        // returned; a failure reverts (stays/returns to inactive) visually.
        // Passes `this._cancellable` so destroy() can cancel the in-flight call;
        // the reply callback still fires after cancellation/destroy (GDBus
        // guarantees the callback runs), so it must not touch `this` state or
        // the (possibly freed) actor once destroyed — see the `_destroyed`
        // guard below, which instead releases the just-acquired cookie.
        _inhibit() {
            this._pending = true;
            try {
                Gio.DBus.session.call(
                    BUS_NAME,
                    OBJECT_PATH,
                    IFACE_NAME,
                    'Inhibit',
                    new GLib.Variant('(susu)', [APP_ID, 0, REASON, this._inhibitFlags()]),
                    new GLib.VariantType('(u)'),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    this._cancellable,
                    (connection, result) => {
                        this._pending = false;
                        try {
                            const reply = connection.call_finish(result);
                            const [cookie] = reply.deep_unpack();
                            if (this._destroyed || this._cancellable.is_cancelled()) {
                                // The widget is gone (or being torn down): do not
                                // touch `this._cookie`/the actor. The reply still
                                // holds a live inhibit cookie the session manager
                                // will never see released otherwise, so release it
                                // directly, fire-and-forget.
                                this._releaseCookie(cookie);
                                return;
                            }
                            this._cookie = cookie;
                            this._applyVisualState(true);
                        } catch (error) {
                            logError(error, 'caffeine: Inhibit call failed');
                            if (this._destroyed)
                                return;
                            this._cookie = null;
                            // Nothing is being kept awake, so no deadline either.
                            this._setDeadline(0);
                            this._applyVisualState(false);
                        }
                    }
                );
            } catch (error) {
                logError(error, 'caffeine: failed to call Inhibit');
                this._pending = false;
                this._cookie = null;
                this._setDeadline(0);
                this._applyVisualState(false);
            }
        }

        // Fire-and-forget Uninhibit(cookie) for a cookie that arrived after the
        // widget was already destroyed (see _inhibit above). Independent of
        // `this._cookie`/`this._cancellable` since the widget's own state has
        // already been torn down by the time this runs.
        _releaseCookie(cookie) {
            try {
                Gio.DBus.session.call(
                    BUS_NAME,
                    OBJECT_PATH,
                    IFACE_NAME,
                    'Uninhibit',
                    new GLib.Variant('(u)', [cookie]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (connection, result) => {
                        try {
                            connection.call_finish(result);
                        } catch (error) {
                            logError(error, 'caffeine: late Uninhibit call failed');
                        }
                    }
                );
            } catch (error) {
                logError(error, 'caffeine: failed to call late Uninhibit');
            }
        }

        // Async Uninhibit(cookie) call; `fireAndForget` is used from destroy()
        // where there is no actor left to update visually.
        _uninhibit(fireAndForget) {
            if (this._cookie === null)
                return;
            const cookie = this._cookie;
            this._cookie = null;
            if (!fireAndForget)
                this._applyVisualState(false);
            try {
                Gio.DBus.session.call(
                    BUS_NAME,
                    OBJECT_PATH,
                    IFACE_NAME,
                    'Uninhibit',
                    new GLib.Variant('(u)', [cookie]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    this._cancellable,
                    (connection, result) => {
                        try {
                            connection.call_finish(result);
                        } catch (error) {
                            logError(error, 'caffeine: Uninhibit call failed');
                        }
                    }
                );
            } catch (error) {
                logError(error, 'caffeine: failed to call Uninhibit');
            }
        }

        destroy() {
            // Mark destroyed FIRST so any in-flight Inhibit reply callback (see
            // _inhibit) knows not to touch `this._cookie` or call
            // _applyVisualState() on this (about to be freed) actor.
            this._destroyed = true;
            // The deadline timer and the tooltip tick outlive the actor unless
            // they are dropped here; _setDeadline(0) also cancels the expiry.
            this._setDeadline(0);
            if (this._tooltipTickId) {
                GLib.Source.remove(this._tooltipTickId);
                this._tooltipTickId = null;
            }
            if (this._menu) {
                this._menu.destroy();
                this._menu = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            try {
                // Release an already-acquired cookie (the common case: the
                // widget had successfully inhibited before being destroyed).
                // Issue this call BEFORE cancelling `this._cancellable` below —
                // it is passed the same cancellable, and an ALREADY-cancelled
                // GCancellable makes GDBus short-circuit a brand-new async call
                // before it is even sent, which would leak this cookie instead
                // of releasing it.
                this._uninhibit(true);
            } catch (error) {
                logError(error, 'caffeine: failed to release inhibit on destroy');
            }
            try {
                // Cancel a still-pending Inhibit call, if any (the race this fix
                // targets: destroyed before the Inhibit reply arrived). GDBus
                // still invokes the reply callback after cancellation, so this
                // only short-circuits the wait; the `_destroyed` guard in the
                // callback is what actually prevents touching freed state, and
                // releases the cookie if the call had in fact already succeeded.
                this._cancellable.cancel();
            } catch (error) {
                logError(error, 'caffeine: failed to cancel pending D-Bus call');
            }
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new CaffeineButton(options ?? {});
}
