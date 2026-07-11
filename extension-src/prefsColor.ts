// @ts-nocheck
// @tag:prefs-color
//
// Shared GTK colour-picker helpers used by widget prefs.ts modules
// (cpu-load-monitor, ai-agent-usage, ai-agent-status, break-timer). Kept
// gi-heavy and untyped like the prefs modules that use it.

import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import {definedProps} from './props.js';

export function hexToRgba(hex) {
    const rgba = new Gdk.RGBA();
    rgba.parse(hex || '#000000');
    return rgba;
}

export function rgbaToHex(rgba) {
    const channel = value =>
        Math.round(Math.max(0, Math.min(1, value)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(rgba.red)}${channel(rgba.green)}${channel(rgba.blue)}`;
}

// Unified colour-picker button factory: `fallback` is applied when
// `target[key]` is falsy (pass `undefined` for callers that never want a
// fallback), and `tooltip` is set as `tooltip_text` (pass `undefined` for
// callers that show no tooltip).
export function colorButton(target, key, fallback, commit, tooltip) {
    // `tooltip_text: undefined` must be dropped, not passed through: GJS rejects
    // an `undefined` value in a GObject initializer (cpu-load-monitor is the only
    // caller with no tooltip, which is why only its settings page failed to open).
    const button = new Gtk.ColorDialogButton(definedProps({
        dialog: new Gtk.ColorDialog({with_alpha: false}),
        rgba: hexToRgba(target[key] || fallback),
        valign: Gtk.Align.CENTER,
        tooltip_text: tooltip,
    }));
    button.connect('notify::rgba', () => {
        target[key] = rgbaToHex(button.get_rgba());
        commit();
    });
    return button;
}
