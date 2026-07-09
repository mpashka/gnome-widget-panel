// @ts-nocheck
// @tag:widget-printscreen
//
// Panel button that opens the GNOME interactive screenshot UI (the same overlay
// as the PrintScreen key): area/window/screen selection, screen recording and
// the capture button. It owns no menu and nothing to release beyond the button.

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {buildButtonContent} from '../panelButtonContent.js';

const DEFAULTS = {icon: 'camera-photo-symbolic', text: ''};

export function create(parent, options) {
    const button = new St.Button({
        style_class: 'button ctlBtn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: buildButtonContent(options ?? {}, DEFAULTS),
    });
    button.connect('clicked', () => {
        // Guarded: a failure to open the screenshot UI must never propagate out
        // of the click handler.
        try {
            Main.screenshotUI.open();
        } catch (error) {
            logError(error, 'printscreen: failed to open the screenshot UI');
        }
    });
    return button;
}
