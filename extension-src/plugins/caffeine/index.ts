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
                    null,
                    (connection, result) => {
                        this._pending = false;
                        try {
                            const reply = connection.call_finish(result);
                            const [cookie] = reply.deep_unpack();
                            this._cookie = cookie;
                            this._applyVisualState(true);
                        } catch (error) {
                            logError(error, 'caffeine: Inhibit call failed');
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
                    null,
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
            try {
                this._uninhibit(true);
            } catch (error) {
                logError(error, 'caffeine: failed to release inhibit on destroy');
            }
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new CaffeineButton(options ?? {});
}
