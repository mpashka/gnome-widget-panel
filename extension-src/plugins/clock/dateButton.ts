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
import PangoCairo from 'gi://PangoCairo';
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

// Draws the time text with PangoCairo so it can be rotated 90° in a vertical
// panel without being clipped: it requests the swapped (tall/narrow) size and
// rotates the drawing, exactly like the graph widgets. An St.Label cannot do
// this — Clutter actor rotation keeps the original wide allocation, which made
// the panel too wide and truncated the time.
const TimeDrawer = GObject.registerClass(
    class TimeDrawer extends St.DrawingArea {
        _init() {
            super._init({
                style_class: 'clock-time',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._text = '';
            this._rotated = false;
            this._rotateDir = 'right';
            this.connect('repaint', () => this._draw());
            this.connect('notify::mapped', () => {
                if (this.mapped)
                    this._updateSize();
            });
        }

        setText(text) {
            const value = text || '';
            if (value === this._text)
                return;
            this._text = value;
            this._updateSize();
            this.queue_repaint();
        }

        setPanelLayout(vertical, rotation) {
            this._rotated = !!vertical;
            this._rotateDir = rotation === 'left' ? 'left' : 'right';
            this._updateSize();
            this.queue_repaint();
        }

        // Request natural text size, swapped when rotated. Needs the theme node,
        // so it only runs once the actor is on the stage.
        _updateSize() {
            if (!this.get_stage())
                return;
            try {
                const layout = this.create_pango_layout(this._text || ' ');
                const [tw, th] = layout.get_pixel_size();
                if (this._rotated)
                    this.set_size(th, tw);
                else
                    this.set_size(tw, th);
            } catch (error) {
                // Ignore; a later repaint/map will size it.
            }
        }

        _draw() {
            const ctx = this.get_context();
            try {
                const [sw, sh] = this.get_surface_size();
                const themeNode = this.get_theme_node();
                const color = themeNode.get_foreground_color();
                ctx.setSourceRGBA(
                    color.red / 255,
                    color.green / 255,
                    color.blue / 255,
                    (color.alpha || 255) / 255
                );
                if (this._rotated) {
                    if (this._rotateDir === 'left') {
                        ctx.translate(0, sh);
                        ctx.rotate(-Math.PI / 2);
                    } else {
                        ctx.translate(sw, 0);
                        ctx.rotate(Math.PI / 2);
                    }
                }
                const layout = PangoCairo.create_layout(ctx);
                const font = themeNode.get_font();
                if (font)
                    layout.set_font_description(font);
                layout.set_text(this._text, -1);
                PangoCairo.show_layout(ctx, layout);
            } catch (error) {
                logError(error, 'GNOME Widget Panel clock draw failed');
            } finally {
                ctx.$dispose();
            }
        }
    }
);

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

            this._dateLabel = new TimeDrawer();
            this._dateLabel.setText(this._renderTime());
            this.add_child(this._dateLabel);

            // Refresh the formatted time once per second; released in destroy().
            this._timerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                1,
                () => {
                    this._dateLabel.setText(this._renderTime());
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
        // Called by the panel host when its orientation/rotation changes; the
        // TimeDrawer swaps its size and rotates the Cairo drawing so the time
        // reads vertically without being clipped or widening the strip.
        setPanelLayout(info) {
            if (!this._dateLabel)
                return;
            const vertical = !!(info && info.vertical);
            const rotation = info && info.rotation === 'left' ? 'left' : 'right';
            this._dateLabel.setPanelLayout(vertical, rotation);
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
