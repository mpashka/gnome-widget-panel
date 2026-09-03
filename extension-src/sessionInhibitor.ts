// @ts-nocheck
// @tag:session-inhibitor
//
// Shared access to org.gnome.SessionManager's idle/suspend inhibitors: holding
// one (the caffeine widget, and the break timer while its reminders are paused)
// and asking whether anything else holds one (the break timer stays silent
// while the session is being kept awake for a call or a presentation).
//
// One module because the tricky parts are the same for every caller: the reply
// to Inhibit() arrives asynchronously and may land AFTER the widget is gone, in
// which case the cookie it carries must still be released or the session is
// kept awake forever with nobody left to stop it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.gnome.SessionManager';
const OBJECT_PATH = '/org/gnome/SessionManager';
const IFACE_NAME = 'org.gnome.SessionManager';

/** Inhibit the session being marked idle (the screensaver). */
export const INHIBIT_IDLE = 4;
/** Inhibit the session being suspended. */
export const INHIBIT_SUSPEND = 8;


function callSessionManager(method, parameters, replyType, cancellable, onReply) {
    Gio.DBus.session.call(
        BUS_NAME,
        OBJECT_PATH,
        IFACE_NAME,
        method,
        parameters,
        replyType,
        Gio.DBusCallFlags.NONE,
        -1,
        cancellable,
        onReply
    );
}


// Fire-and-forget Uninhibit for a cookie whose owner is already gone; it must
// not touch any widget state, which is why it is a free function.
function releaseCookie(cookie, label) {
    try {
        callSessionManager(
            'Uninhibit',
            new GLib.Variant('(u)', [cookie]),
            null,
            null,
            (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (error) {
                    logError(error, `${label}: late Uninhibit call failed`);
                }
            }
        );
    } catch (error) {
        logError(error, `${label}: failed to call late Uninhibit`);
    }
}


/**
 * Is anything at all holding an inhibitor of the given kind right now? Answers
 * `false` when the session manager cannot be reached: "nothing is inhibiting"
 * is the safe assumption — it only means a reminder is allowed to speak.
 */
export function queryInhibited(flags = INHIBIT_IDLE, cancellable = null) {
    return new Promise((resolve) => {
        try {
            callSessionManager(
                'IsInhibited',
                new GLib.Variant('(u)', [flags]),
                new GLib.VariantType('(b)'),
                cancellable,
                (connection, result) => {
                    try {
                        const [inhibited] = connection.call_finish(result).deep_unpack();
                        resolve(!!inhibited);
                    } catch (error) {
                        resolve(false);
                    }
                }
            );
        } catch (error) {
            resolve(false);
        }
    });
}



/**
 * One inhibitor held by one widget. `inhibit()`/`release()` are idempotent, so
 * callers may drive them straight from a state change without tracking whether
 * the call is needed.
 *
 * `onChanged(held)` reports every transition the object makes — including the
 * failure of an Inhibit call, which reports `false` — so a widget can keep its
 * visuals honest instead of assuming the session manager agreed.
 */
export class SessionInhibitor {
    constructor({appId, label = appId, onChanged = null} = {}) {
        this._appId = appId;
        this._label = label;
        this._onChanged = onChanged;
        this._cookie = null;
        this._pending = false;
        this._destroyed = false;
        this._cancellable = new Gio.Cancellable();
    }

    /** True while the session manager has given us a cookie. */
    get held() {
        return this._cookie !== null;
    }

    /** True while an Inhibit call is in flight. */
    get pending() {
        return this._pending;
    }

    inhibit(reason, flags = INHIBIT_IDLE | INHIBIT_SUSPEND) {
        if (this._destroyed || this._pending || this._cookie !== null)
            return;
        this._pending = true;
        try {
            callSessionManager(
                'Inhibit',
                new GLib.Variant('(susu)', [this._appId, 0, reason, flags]),
                new GLib.VariantType('(u)'),
                this._cancellable,
                (connection, result) => {
                    this._pending = false;
                    try {
                        const [cookie] = connection.call_finish(result).deep_unpack();
                        // The owner is gone (or being torn down): the cookie is
                        // live and nobody would ever release it, so release it
                        // here and touch nothing else.
                        if (this._destroyed || this._cancellable.is_cancelled()) {
                            releaseCookie(cookie, this._label);
                            return;
                        }
                        this._cookie = cookie;
                        this._notify(true);
                    } catch (error) {
                        logError(error, `${this._label}: Inhibit call failed`);
                        if (this._destroyed)
                            return;
                        this._cookie = null;
                        this._notify(false);
                    }
                }
            );
        } catch (error) {
            logError(error, `${this._label}: failed to call Inhibit`);
            this._pending = false;
            this._cookie = null;
            this._notify(false);
        }
    }

    /** Release the inhibitor. `silent` skips the `onChanged` call (teardown). */
    release(silent = false) {
        if (this._cookie === null)
            return;
        const cookie = this._cookie;
        this._cookie = null;
        if (!silent)
            this._notify(false);
        try {
            callSessionManager(
                'Uninhibit',
                new GLib.Variant('(u)', [cookie]),
                null,
                this._cancellable,
                (connection, result) => {
                    try {
                        connection.call_finish(result);
                    } catch (error) {
                        logError(error, `${this._label}: Uninhibit call failed`);
                    }
                }
            );
        } catch (error) {
            logError(error, `${this._label}: failed to call Uninhibit`);
        }
    }

    /**
     * Give up the inhibitor and stop reporting. Safe to call from a widget's
     * `destroy()`: an Inhibit reply still in flight releases its own cookie.
     */
    destroy() {
        this._destroyed = true;
        this.release(true);
        this._cancellable.cancel();
        this._onChanged = null;
    }

    _notify(held) {
        if (this._onChanged)
            this._onChanged(held);
    }
}
