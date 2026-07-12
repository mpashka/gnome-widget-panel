// @ts-nocheck
// @tag:ui
/*
 * Floating-Mini-Panel for GNOME Shell 46+
 *
 * Copyright 2024, 2025 Gerhard Himmel
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as SystemInfo from './systemInfo.js';

const DISPLAY = global.display;

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

// GNOME 50's Mutter no longer exposes the `Meta.Cursor` enum that older Shell
// releases used, so `Meta.Cursor.MOVE` / `.DEFAULT` throw "Meta.Cursor is
// undefined". Guard the cursor change: when the enum is present we still show
// the move/default cursor while dragging; otherwise the drag just keeps the
// default cursor. Without this the thrown error aborted the drag cleanup and
// the post-drag `_relocate` mid-way.
function setDragCursor(name) {
    try {
        const value = Meta.Cursor?.[name];
        if (value !== undefined)
            DISPLAY.set_cursor(value);
    } catch (_e) {}
}

const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

// Press-and-hold threshold (ms) that distinguishes a click from a long-press
// (orientation toggle on the middle button, temporary hide on the right
// button). Must comfortably exceed how long an ordinary deliberate click can
// hold the button down — 250ms was too tight: a normal (if slightly slow, e.g.
// touchpad secondary-click) right-click routinely takes longer than that, so it
// was misread as a long-press and fired `_tmpHide()` (hiding the whole panel
// for 5s, see extension.ts `_tmpHide`) instead of opening the context menu —
// see issue #3. Left-button dragging does NOT wait for this threshold: it
// starts on the first pointer movement (see the MOTION handler), so raising it
// never makes the widget feel "glued".
const LONGPRESS_MS = 400;

const CtlActions = GObject.registerClass(
    class CtlActions extends Clutter.Action {
        constructor(actor) {
            super();
            this._actor = actor;
            this._parent = this._actor._parent;
            this._click = false;
            this._longpress = false;
            this._menuOpenAtPress = false;
            this._grab = null;
        }

        vfunc_handle_event(event) {
            switch (event.type()) {
                case Clutter.EventType.MOTION:
                    // Start the drag on the FIRST movement while the primary
                    // button is held, instead of waiting for the long-press
                    // timer to enter drag mode. Gating drag-start on the timer
                    // made the widget feel "glued" — it would not move until
                    // LONGPRESS_MS elapsed — which got noticeably worse once #3
                    // raised that threshold to 400ms to fix right-click. Now the
                    // threshold only governs the middle/right long-press actions;
                    // dragging is immediate. `_leftBtnLongPress()` guards on a
                    // null grab, so the still-pending timer is a harmless no-op.
                    if (
                        this._grab === null &&
                        !this._longpress &&
                        event.get_state() & Clutter.ModifierType.BUTTON1_MASK
                    ) {
                        this._longpress = true;
                        if (this._timeoutId) {
                            GLib.Source.remove(this._timeoutId);
                            this._timeoutId = null;
                        }
                        this._leftBtnLongPress();
                    }
                    // Execute Drag
                    if (this._grab !== null) {
                        let [x, y] = event.get_coords();
                        x = Math.ceil(x - this._actor.width / 2);
                        y = Math.ceil(y - this._actor.height / 2);
                        this._parent.set_position(x, y);
                    }
                    break;
                case Clutter.EventType.BUTTON_PRESS:
                    // Reset the per-sequence gesture flags here in addition to
                    // vfunc_register_sequence: the panel menu-manager's modal
                    // grab can consume a sequence's register callback, leaving
                    // stale _click/_longpress from the previous cycle and
                    // breaking the next click. Also snapshot the menu's open
                    // state *now*, before the grab's ClickGesture can toggle it
                    // on the matching release, so right-click can toggle the
                    // menu deterministically (see _rightBtnClick).
                    this._click = false;
                    this._longpress = false;
                    this._menuOpenAtPress = this._actor.menu.isOpen;
                    // Test longpress
                    if (this._timeoutId) {
                        GLib.Source.remove(this._timeoutId);
                        this._timeoutId = null;
                    }
                    this._timeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        LONGPRESS_MS,
                        () => {
                            if (!this._click) {
                                this._longpress = true;
                                // Ignoring modifier keys (event.get_state())
                                switch (event.get_button()) {
                                    case Clutter.BUTTON_PRIMARY:
                                        this._leftBtnLongPress();
                                        break;
                                    case Clutter.BUTTON_MIDDLE:
                                        this._middleBtnLongPress();
                                        break;
                                    case Clutter.BUTTON_SECONDARY:
                                        this._rightBtnLongPress();
                                        break;
                                    default:
                                        break;
                                }
                            }
                            this._timeoutId = null;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                    break;
                case Clutter.EventType.BUTTON_RELEASE:
                    // Button released after longpress
                    if (this._longpress) {
                        // End Drag and clean up
                        if (this._grab !== null) {
                            Main.popModal(this._grab);
                            this._grab.dismiss();
                            this._grab = null;
                            this._actor.firstChild.opacity = 255;
                            setDragCursor('DEFAULT');
                            this._parent._relocate(true);
                        }
                    } else {
                        // Button released after click (quick release)
                        this._click = true;
                        let state = event.get_state();
                        switch (event.get_button()) {
                            case Clutter.BUTTON_PRIMARY:
                                this._leftBtnClick(state);
                                break;
                            case Clutter.BUTTON_MIDDLE:
                                this._middleBtnClick(state);
                                break;
                            case Clutter.BUTTON_SECONDARY:
                                this._rightBtnClick(state);
                                break;
                            default:
                                break;
                        }
                    }
                    break;
                default:
                    break;
            }
        }

        // Left longpress action
        _leftBtnLongPress() {
            // Prepare Drag if no other drag is ongoing
            if (this._grab === null) {
                this._grab = Main.pushModal(this._actor);
                this._actor.remove_style_pseudo_class('focus');
                this._parent.style = null;
                this._actor.firstChild.opacity = 0;
                setDragCursor(shellVersion < 47 ? 'MOVE_OR_RESIZE_WINDOW' : 'MOVE');
            }
        }

        // Middle longpress action
        _middleBtnLongPress() {
            // ORIENTATION
            this._actor._changeOrientation();
        }

        // Right longpress action
        _rightBtnLongPress() {
            this._parent._tmpHide();
        }

        // Left click
        _leftBtnClick(state) {
            switch (state) {
                case 0:
                    // No-op: a plain left click on the drag handle must not open
                    // the overview / app grid. The handle is only for dragging
                    // and the (long-press) menu now; a dedicated activities /
                    // gnome-menu widget provides that entry point instead.
                    break;
                case Clutter.ModifierType.SHIFT_MASK:
                    this._actor._doAlign(Alignment.LEFT | Alignment.TOP);
                    break;
                case Clutter.ModifierType.CONTROL_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(Alignment.RIGHT | Alignment.TOP);
                    } else {
                        this._actor._doAlign(Alignment.LEFT | Alignment.BOTTOM);
                    }
                    break;
                default:
                    break;
            }
        }

        // Middle click
        _middleBtnClick(state) {
            switch (state) {
                case 0:
                    this._parent._indsDrawer.toggle();
                    break;
                case Clutter.ModifierType.SHIFT_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(Alignment.CENTER | Alignment.LEFT);
                    } else {
                        this._actor._doAlign(Alignment.CENTER | Alignment.TOP);
                    }
                    break;
                case Clutter.ModifierType.CONTROL_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(
                            Alignment.CENTER | Alignment.RIGHT
                        );
                    } else {
                        this._actor._doAlign(
                            Alignment.CENTER | Alignment.BOTTOM
                        );
                    }
                    break;
                default:
                    break;
            }
        }

        // Right click
        _rightBtnClick(state) {
            switch (state) {
                case 0:
                    // Toggle deterministically from the press-time snapshot.
                    // Reading menu.isOpen (or calling menu.toggle()) here would
                    // race with the panel menu-manager's ClickGesture, which
                    // closes an open menu on this same release. That race made
                    // right-click open the menu only every other time. Deciding
                    // from the state captured on press removes the race.
                    if (this._menuOpenAtPress) {
                        this._actor.menu.close();
                    } else {
                        this._actor.menu.open();
                    }
                    break;
                case Clutter.ModifierType.SHIFT_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(Alignment.LEFT | Alignment.BOTTOM);
                    } else {
                        this._actor._doAlign(Alignment.RIGHT | Alignment.TOP);
                    }
                    break;
                case Clutter.ModifierType.CONTROL_MASK:
                    this._actor._doAlign(Alignment.RIGHT | Alignment.BOTTOM);
                    break;
                default:
                    break;
            }
        }

        // Register new button press and release with 'return true'
        vfunc_register_sequence(event) {
            // Reset detected Click and Longpress properties here before a new
            // Press-Release-Cycle starts, because they are needed during
            // the complete cycle.
            if (event.type() === Clutter.EventType.BUTTON_PRESS) {
                this._click = false;
                this._longpress = false;
            }
            return true;
        }

        vfunc_sequence_cancelled() {}

        destroy() {
            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
            }
            // NB: this is a Clutter.Action, not an actor — it has no
            // `super.destroy()`. Calling it threw "super.destroy is not a
            // function", which aborted ControlButton.destroy() → the whole
            // FloatingMiniPanel.destroy()/disable(). On screen lock that left the
            // extension in ERROR so GNOME never re-enabled it on unlock and the
            // widget vanished (issue #7). The action is released when its actor
            // is destroyed; here we only need to drop the pending timeout.
        }
    }
);

const MenuItem = GObject.registerClass(
    class MenuItem extends PopupMenu.PopupBaseMenuItem {
        constructor(name, hotkey, action, params) {
            super(params);

            this.side = new St.Label({
                text: name,
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
            });
            this.add_child(this.side);
            this.add_child(
                new St.Label({
                    text: hotkey,
                    x_expand: true,
                    x_align: Clutter.ActorAlign.END,
                    style: 'color: grey !important;',
                })
            );
            this.connect('activate', () => action());
        }
    }
);

export const ControlButton = GObject.registerClass(
    class ControlButton extends St.BoxLayout {
        constructor(parent) {
            super({
                name: 'ctlBtn',
                reactive: true,
                track_hover: true,
                style_class: 'button ctlBtn',
            });

            this._parent = parent;

            this.add_child(
                new St.Icon({
                    icon_name: 'list-drag-handle-symbolic',
                    style_class: 'system-status-icon',
                    x_expand: true,
                    x_align: Clutter.ActorAlign.CENTER,
                })
            );

            // Control Menu
            this.menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            Main.uiGroup.add_child(this.menu.actor);
            Main.panel.menuManager.addMenu(this.menu);
            this.menu.actor.hide();

            // Non-reactive header showing the extension name and version +
            // release channel (e.g. "0.1.0 (alpha)"), read via the process-safe
            // systemInfo helper. Mirrors the About group's name/version row.
            this.menu.addMenuItem(
                new MenuItem(
                    'GNOME Widget Panel',
                    SystemInfo.versionDisplay(),
                    () => {},
                    {reactive: false, can_focus: false}
                )
            );
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this.menu.addMenuItem(
                new MenuItem('Settings…', '', () => {
                    this._parent.openPreferences();
                })
            );

            // "Release notes" opens this version's GitHub Release page (the
            // per-version release-notes page, version in its URL). controlButton
            // runs in the Shell process; systemInfo is process-safe, so call it
            // directly, like "Report a bug" below.
            this.menu.addMenuItem(
                new MenuItem('Release notes', '', () => {
                    SystemInfo.openUrl(SystemInfo.releaseNotesUrl());
                })
            );

            // Opens the extensions.gnome.org store page for this extension.
            this.menu.addMenuItem(
                new MenuItem('View on extensions.gnome.org', '', () => {
                    SystemInfo.openUrl(SystemInfo.egoUrl);
                })
            );

            // Opens a prefilled GitHub bug-report issue form in the browser.
            // controlButton runs in the Shell process; systemInfo is process-safe
            // (guards its Shell-only reads), so call it directly to keep the panel
            // and menu decoupled.
            this.menu.addMenuItem(
                new MenuItem('Report a bug', '', () => {
                    SystemInfo.openUrl(SystemInfo.bugReportUrl());
                })
            );

            this.menu.connect('open-state-changed', () => {
                if (this.has_style_pseudo_class('active')) {
                    this.remove_style_pseudo_class('active');
                } else {
                    this.add_style_pseudo_class('active');
                }
                return GLib.SOURCE_PROPAGATE;
            });

            // START CODE VERTICAL
            // Keep this control button's orientation in sync with the panel so
            // the gestures in CtlActions can read `this[this.orientStr]`, and
            // point the (Settings) menu arrow at the correct side. The former
            // per-item label rewriting was dropped together with the alignment
            // menu items; panel alignment now lives in the preferences window.
            this.orientStr = shellVersion > 47 ? 'orientation' : 'vertical';
            this._parent.bind_property_full(
                this.orientStr,
                this,
                this.orientStr,
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    this.menu._boxPointer._userArrowSide = value
                        ? St.Side.LEFT
                        : St.Side.TOP;
                    return [binding, value];
                },
                null
            );

            // Handling for GNOME 46, 47, 48, 49
            // Keep a reference so destroy() can release CtlActions' own
            // long-press GLib timer; add_action() does not hand back (or
            // itself release) the action instance.
            this._ctlActions = new CtlActions(this);
            this.add_action(this._ctlActions);

            this.connect('scroll-event', (obj, event) => {
                Main.wm.handleWorkspaceScroll(event);
            });
        }

        _doAlign(align) {
            this._parent._sets.set_int('aligned', align);
            this._parent._relocate(false);
        }

        // START CODE VERTICAL
        // Toggle horizontal <-> vertical by writing the single `orientation`
        // enum; the panel's `changed::orientation` handler applies the layout,
        // rotates the graph widgets and relocates. (Going vertical uses the
        // `right` rotation; pick `left`/`right` explicitly in preferences.)
        _changeOrientation() {
            this._doAlign(Alignment.NONE);
            const goVertical = this._parent.width > this._parent.height;
            this._parent._sets.set_string(
                'orientation',
                goVertical ? 'right' : 'horizontal'
            );
        }

        destroy() {
            if (this._ctlActions) {
                this._ctlActions.destroy();
                this._ctlActions = null;
            }
            super.destroy();
        }
    }
);
