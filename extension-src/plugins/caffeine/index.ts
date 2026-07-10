// @ts-nocheck
// @tag:widget-caffeine
//
// Panel toggle button that manually inhibits the screensaver/suspend via
// org.gnome.SessionManager's Inhibit/Uninhibit D-Bus methods. Useful during
// calls: native clients (e.g. Zoom on Wayland) often fail to inhibit idle
// themselves, unlike web clients that inhibit through the browser's portal.
// See index.md for the motivation and D-Bus details.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

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

const CaffeineButton = GObject.registerClass(
    class CaffeineButton extends St.Button {
        _init(options) {
            this._options = options;
            this._cookie = null;
            this._pending = false;
            this._destroyed = false;
            this._cancellable = new Gio.Cancellable();

            super._init({
                style_class: 'button ctlBtn',
                reactive: true,
                track_hover: true,
                can_focus: true,
                child: buildButtonContent(options, DEFAULTS),
            });

            this.connect('clicked', () => this._onClicked());
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
            } catch (error) {
                logError(error, 'caffeine: failed to update visual state');
            }
        }

        _onClicked() {
            try {
                if (this._pending)
                    return;
                if (this._cookie !== null)
                    this._uninhibit(false);
                else
                    this._inhibit();
            } catch (error) {
                logError(error, 'caffeine: click handler failed');
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
                            this._applyVisualState(false);
                        }
                    }
                );
            } catch (error) {
                logError(error, 'caffeine: failed to call Inhibit');
                this._pending = false;
                this._cookie = null;
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
