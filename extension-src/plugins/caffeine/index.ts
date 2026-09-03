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
// The D-Bus plumbing itself is shared with the break timer, which holds an
// inhibitor of its own while its reminders are paused: `../../sessionInhibitor.ts`.
// See index.md for the motivation and D-Bus details.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {nowSeconds} from '../../colorUtils.js';
import {formatDuration} from '../../duration.js';
import {
    INHIBIT_IDLE,
    INHIBIT_SUSPEND,
    SessionInhibitor,
} from '../../sessionInhibitor.js';
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

const APP_ID = 'gnome-widget-panel';
const REASON = 'Manual caffeine: keep screen awake during a call';

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
            this._destroyed = false;
            // The session inhibitor itself lives in the shared module; this
            // widget only decides when it is held and what that looks like.
            this._inhibitor = new SessionInhibitor({
                appId: APP_ID,
                label: 'caffeine',
                onChanged: (held) => this._onInhibitChanged(held),
            });
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
                ? INHIBIT_IDLE
                : INHIBIT_IDLE | INHIBIT_SUSPEND;
        }

        // Whether the session manager currently keeps the screen awake for us.
        get _active() {
            return this._inhibitor.held;
        }

        // Every transition the inhibitor makes, its failures included, so the
        // button never claims a keep-awake the session manager refused.
        _onInhibitChanged(held) {
            if (this._destroyed)
                return;
            if (!held)
                this._setDeadline(0);
            this._applyVisualState(held);
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
                if (this._inhibitor.pending)
                    return;
                if (this._active)
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
            this._inhibitor.inhibit(REASON, this._inhibitFlags());
            this._updateTooltip();
        }

        _turnOff() {
            this._setDeadline(0);
            this._inhibitor.release();
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
                    this._inhibitor.release();
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
            if (this._active) {
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
            if (!this._active)
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

        destroy() {
            // Mark destroyed FIRST so a late inhibitor callback knows not to
            // touch this (about to be freed) actor.
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
            // Releases the cookie and cancels an in-flight Inhibit; a reply
            // that still arrives releases its own cookie rather than leaving the
            // session awake with nobody left to stop it (see sessionInhibitor).
            this._inhibitor.destroy();
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new CaffeineButton(options ?? {});
}
