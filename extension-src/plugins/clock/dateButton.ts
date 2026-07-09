// @ts-nocheck
// @tag:widget-clock
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
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PANELBOX = Main.layoutManager.panelBox;
const DATEMENU = Main.panel.statusArea['dateMenu'];
const DATESOURCEACTOR = DATEMENU.menu.sourceActor;
const DATEARROWALIGNMENT = DATEMENU.menu._arrowAlignment;

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

// Default strftime-style template used when `options.format` is unset.
const DEFAULT_FORMAT = '%H:%M';

export const DateButton = GObject.registerClass(
    class DateButton extends St.BoxLayout {
        constructor(parent, options) {
            super({
                name: 'dateBtn',
                reactive: true,
                track_hover: true,
                style_class: 'button btn',
            });

            this._parent = parent;

            // strftime-style template rendered by GLib.DateTime.format, e.g.
            // `%H:%M` or `%a %d %b %H:%M:%S`. Edited via prefs.ts.
            this._format =
                typeof options?.format === 'string' && options.format
                    ? options.format
                    : DEFAULT_FORMAT;

            // START CODE VERTICAL
            this.orientStr = shellVersion > 47 ? 'orientation' : 'vertical';

            this._parent.bind_property_full(
                this.orientStr,
                this,
                this.orientStr,
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    if (value) {
                        DATEMENU.menu._boxPointer._userArrowSide = St.Side.LEFT;
                    } else {
                        DATEMENU.menu._boxPointer._userArrowSide = St.Side.TOP;
                    }
                    return [binding, value];
                },
                null
            );

            this.connect('notify::mapped', () => {
                DATEMENU.menu.close();
                if (this.mapped) {
                    DATEMENU.menu.sourceActor = this;
                    DATEMENU.menu._arrowAlignment = 0.5;
                    // START CODE VERTICAL
                    if (this[this.orientStr])
                        DATEMENU.menu._boxPointer._userArrowSide = St.Side.LEFT;
                } else {
                    DATEMENU.menu.sourceActor = DATESOURCEACTOR;
                    DATEMENU.menu._arrowAlignment = DATEARROWALIGNMENT;
                    // START CODE VERTICAL
                    DATEMENU.menu._boxPointer._userArrowSide = St.Side.TOP;
                }
            });

            this.connect('button-press-event', () => {
                DATEMENU.menu.toggle();
            });

            this._dmConId = DATEMENU.menu.connect('open-state-changed', () => {
                if (this.has_style_pseudo_class('active')) {
                    this.remove_style_pseudo_class('active');
                } else {
                    this.add_style_pseudo_class('active');
                }
                return GLib.SOURCE_PROPAGATE;
            });

            this._dateLabel = new St.Label({
                text: this._renderTime(),
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'padding-top: 2px;', // Align with percentage label
            });
            this.add_child(this._dateLabel);

            // Refresh the formatted label once per second; released in destroy().
            this._timerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                1,
                () => {
                    this._dateLabel.text = this._renderTime();
                    return GLib.SOURCE_CONTINUE;
                }
            );

            this._noteIcon = new St.Icon({
                style_class: 'system-status-icon',
                visible: DATEMENU._indicator.visible,
            });
            this.add_child(this._noteIcon);

            this._noteConId1 = DATEMENU._indicator.bind_property(
                'icon-name',
                this._noteIcon,
                'icon-name',
                GObject.Binding.CREATE_SYNC
            );
            this._noteConId2 = DATEMENU._indicator.bind_property(
                'visible',
                this._noteIcon,
                'visible',
                GObject.Binding.CREATE_SYNC
            );

            Main.wm.setCustomKeybindingHandler(
                'toggle-message-tray',
                Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW |
                    Shell.ActionMode.POPUP,
                this._toggleCalendar.bind(this)
            );
        }

        _renderTime() {
            return GLib.DateTime.new_now_local().format(this._format) || '';
        }

        // Called by the panel host when its orientation/rotation changes. Text
        // cannot be redrawn via Cairo like the graph widgets, so rotate the time
        // label actor 90° so the time reads vertically. To stop the time from
        // being ellipsized ("202…") in the narrow strip we disable ellipsizing
        // and pin the label to its natural (full-text) size, then rotate it about
        // its centre. Horizontal restores exactly the previous behaviour.
        setPanelLayout(info) {
            const vertical = !!(info && info.vertical);
            const rotation = info && info.rotation === 'left' ? 'left' : 'right';
            const label = this._dateLabel;
            if (!label)
                return;
            try {
                label.set_pivot_point(0.5, 0.5);
                const clutterText = label.clutter_text;
                if (vertical) {
                    // Full text, no ellipsis; pin to natural size so rotation
                    // shows the whole time instead of a width-clipped label.
                    if (clutterText)
                        clutterText.ellipsize = Pango.EllipsizeMode.NONE;
                    label.x_expand = false;
                    label.y_expand = false;
                    const [, natWidth] = label.get_preferred_width(-1);
                    const [, natHeight] = label.get_preferred_height(natWidth);
                    label.set_size(natWidth, natHeight);
                    label.rotation_angle_z = rotation === 'left' ? -90 : 90;
                } else {
                    label.rotation_angle_z = 0;
                    if (clutterText)
                        clutterText.ellipsize = Pango.EllipsizeMode.END;
                    label.set_size(-1, -1);
                    label.x_expand = true;
                    label.y_expand = true;
                }
            } catch (error) {
                console.error(`GNOME Widget Panel clock rotation failed: ${error}`);
            }
        }

        _toggleCalendar() {
            if (this.visible || PANELBOX.visible) {
                DATEMENU.menu.toggle();
                if (DATEMENU.menu.isOpen) {
                    DATEMENU.menu.actor.navigate_focus(
                        null,
                        St.DirectionType.TAB_FORWARD,
                        false
                    );
                }
            }
        }

        destroy() {
            Main.wm.setCustomKeybindingHandler(
                'toggle-message-tray',
                Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW |
                    Shell.ActionMode.POPUP,
                Main.wm._toggleCalendar.bind(Main.wm)
            );

            if (this._timerId) {
                GLib.Source.remove(this._timerId);
                this._timerId = null;
            }

            this._noteConId1 = null;
            this._noteConId2 = null;

            DATEMENU.menu.disconnect(this._dmConId);
            this._dmConId = null;

            super.destroy();
        }
    }
);
