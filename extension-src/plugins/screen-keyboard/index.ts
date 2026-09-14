// @ts-nocheck
// @tag:widget-screen-keyboard
//
// Panel button that opens a floating on-screen keyboard with Serbian Cyrillic
// and Latin letters: Serbian text without adding a Serbian input source. See
// index.md for why this is not GNOME's own on-screen keyboard and how the text
// reaches the application in focus.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {CLICK_SHIFT, clickModifiers} from '../../clickModifiers.js';
import {buildButtonContent} from '../panelButtonContent.js';
import {LAYOUTS, keyText, otherScript, parseScript} from './layouts.js';
import {placeBeside} from './placement.js';

const DEFAULTS = {
    icon: 'input-keyboard-symbolic',
    text: '',
};
const GAP = 6;



// Same route as GNOME Shell's own on-screen keyboard (ui/keyboard.js): a client
// speaking text-input takes the string whole, whatever the keymap; any other
// client (X11) gets key events for the characters' keysyms.
class TextSender {
    constructor() {
        const seat = global.stage.context.get_backend().get_default_seat();
        this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    sendText(text) {
        if (Main.inputMethod.currentFocus) {
            Main.inputMethod.commit(text);
            return;
        }
        for (const character of text)
            this.sendKeyval(Clutter.unicode_to_keysym(character.codePointAt(0)));
    }

    sendKeyval(keyval) {
        const time = GLib.get_monotonic_time();
        this._device.notify_keyval(time, keyval, Clutter.KeyState.PRESSED);
        this._device.notify_keyval(time, keyval, Clutter.KeyState.RELEASED);
    }

    destroy() {
        this._device.run_dispose();
    }
}



const ScreenKeyboard = GObject.registerClass(
    class ScreenKeyboard extends St.BoxLayout {
        _init({script, onHide}) {
            super._init({
                style_class: 'gwp-screen-keyboard',
                orientation: Clutter.Orientation.VERTICAL,
                reactive: true,
                visible: false,
            });
            this._script = script;
            this._onHide = onHide;
            this._shift = false;
            this._dragOffset = null;
            this.dragged = false;
            this._sender = new TextSender();
            this._letterKeys = [];
            this._shiftKeys = [];

            const rows = LAYOUTS[script].rows.map(() => this._addRow());
            LAYOUTS[script].rows.forEach((letters, rowIndex) => {
                if (rowIndex === 2)
                    this._addShiftKey(rows[2]);
                letters.forEach((_letter, index) => {
                    const key = this._addKey(rows[rowIndex], {label: ''}, () => this._typeLetter(rowIndex, index));
                    this._letterKeys.push({key, rowIndex, index});
                });
            });
            this._addKey(rows[0], {icon: 'osk-delete-symbolic', wide: true}, () => this._sender.sendKeyval(Clutter.KEY_BackSpace));
            this._addKey(rows[1], {icon: 'osk-enter-symbolic', wide: true}, () => this._sender.sendKeyval(Clutter.KEY_Return));
            this._addShiftKey(rows[2]);

            const bottom = this._addRow();
            this._switchKey = this._addKey(bottom, {label: '', wide: true}, () => this.setScript(otherScript(this._script)));
            this._addKey(bottom, {label: ','}, () => this._sender.sendText(','));
            this._spaceKey = this._addKey(bottom, {label: '', space: true}, () => this._sender.sendKeyval(Clutter.KEY_space));
            this._addKey(bottom, {label: '.'}, () => this._sender.sendText('.'));
            this._addKey(bottom, {icon: 'osk-hide-symbolic', wide: true}, () => this._onHide());

            // Dragged by the gaps between the keys. The implicit pointer grab
            // keeps the motion coming without a Clutter grab, which would take
            // keyboard focus from the application.
            this.connect('button-press-event', (actor, event) => this._onDragPress(event));
            this.connect('motion-event', (actor, event) => this._onDragMotion(event));
            this.connect('button-release-event', () => this._onDragRelease());

            this._relabel();
            Main.layoutManager.addChrome(this);
        }

        get script() {
            return this._script;
        }

        setScript(script) {
            this._script = script;
            this._relabel();
        }

        _addRow() {
            const row = new St.BoxLayout({
                style_class: 'gwp-screen-keyboard-row',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(row);
            return row;
        }

        _addShiftKey(row) {
            this._shiftKeys.push(this._addKey(row, {icon: 'osk-shift-symbolic', wide: true}, () => this._setShift(!this._shift)));
        }

        // Keys are St.Button's own click gesture, which — unlike a Clutter grab
        // or key focus — leaves the application's keyboard focus alone.
        _addKey(row, {label, icon, wide, space}, onActivate) {
            const styles = ['gwp-screen-keyboard-key'];
            if (wide)
                styles.push('gwp-screen-keyboard-key-wide');
            if (space)
                styles.push('gwp-screen-keyboard-key-space');
            const key = new St.Button({
                style_class: styles.join(' '),
                can_focus: false,
                reactive: true,
            });
            if (icon)
                key.set_child(new St.Icon({icon_name: icon, style_class: 'gwp-screen-keyboard-icon'}));
            else
                key.set_label(label);
            key.connect('clicked', () => {
                try {
                    onActivate();
                } catch (error) {
                    logError(error, 'screen-keyboard: key failed');
                }
            });
            row.add_child(key);
            return key;
        }

        _typeLetter(rowIndex, index) {
            const [, , modifiers] = global.get_pointer();
            const physicalShift = (clickModifiers(modifiers) & CLICK_SHIFT) !== 0;
            const letter = LAYOUTS[this._script].rows[rowIndex][index];
            this._sender.sendText(keyText(letter, this._shift || physicalShift));
            if (this._shift)
                this._setShift(false);
        }

        _setShift(shift) {
            this._shift = shift;
            this._relabel();
        }

        _relabel() {
            const layout = LAYOUTS[this._script];
            for (const {key, rowIndex, index} of this._letterKeys)
                key.set_label(keyText(layout.rows[rowIndex][index], this._shift));
            for (const shiftKey of this._shiftKeys) {
                if (this._shift)
                    shiftKey.add_style_pseudo_class('checked');
                else
                    shiftKey.remove_style_pseudo_class('checked');
            }
            this._switchKey.set_label(LAYOUTS[otherScript(this._script)].shortName);
            this._spaceKey.set_label(layout.name);
        }

        // The press is never consumed: St.Button's click gesture is cancelled
        // as soon as an ancestor answers EVENT_STOP for the same press, which
        // left every key dead. Whether it landed on a key is decided by the
        // picked actor rather than event.get_source(), which is null for events
        // an input device injects.
        _onDragPress(event) {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            const [pointerX, pointerY] = event.get_coords();
            const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, pointerX, pointerY);
            if (picked !== this)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = this.get_position();
            this._dragOffset = {x: pointerX - x, y: pointerY - y};
            return Clutter.EVENT_PROPAGATE;
        }

        _onDragMotion(event) {
            if (!this._dragOffset)
                return Clutter.EVENT_PROPAGATE;
            const [pointerX, pointerY] = event.get_coords();
            this.set_position(
                Math.round(pointerX - this._dragOffset.x),
                Math.round(pointerY - this._dragOffset.y)
            );
            this.dragged = true;
            return Clutter.EVENT_STOP;
        }

        _onDragRelease() {
            if (!this._dragOffset)
                return Clutter.EVENT_PROPAGATE;
            this._dragOffset = null;
            return Clutter.EVENT_STOP;
        }

        destroy() {
            this._sender.destroy();
            super.destroy();
        }
    }
);



const ScreenKeyboardButton = GObject.registerClass(
    class ScreenKeyboardButton extends St.Button {
        _init(options) {
            this._script = parseScript(options.script);
            this._keyboard = null;
            super._init({
                style_class: 'button ctlBtn',
                reactive: true,
                track_hover: true,
                can_focus: false,
                accessible_name: 'Screen keyboard',
                child: buildButtonContent(options, DEFAULTS),
            });
            this.connect('clicked', () => this.toggleKeyboard());
        }

        get keyboardVisible() {
            return Boolean(this._keyboard?.visible);
        }

        toggleKeyboard() {
            if (this.keyboardVisible)
                this.hideKeyboard();
            else
                this.showKeyboard();
        }

        showKeyboard() {
            this._keyboard ??= new ScreenKeyboard({
                script: this._script,
                onHide: () => this.hideKeyboard(),
            });
            this._keyboard.show();
            if (!this._keyboard.dragged)
                this._placeKeyboard();
            this.add_style_pseudo_class('checked');
        }

        hideKeyboard() {
            if (!this._keyboard)
                return;
            this._keyboard.hide();
            this.remove_style_pseudo_class('checked');
        }

        _placeKeyboard() {
            const [x, y] = this.get_transformed_position();
            const [width, height] = this.get_transformed_size();
            const monitor = Main.layoutManager.findMonitorForActor(this) ?? Main.layoutManager.primaryMonitor;
            const [, , keyboardWidth, keyboardHeight] = this._keyboard.get_preferred_size();
            const position = placeBeside(
                {x, y, width, height},
                {width: keyboardWidth, height: keyboardHeight},
                {x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height},
                GAP
            );
            this._keyboard.set_position(position.x, position.y);
        }

        destroy() {
            if (this._keyboard) {
                this._keyboard.destroy();
                this._keyboard = null;
            }
            super.destroy();
        }
    }
);

export function create(parent, options) {
    return new ScreenKeyboardButton(options ?? {});
}
