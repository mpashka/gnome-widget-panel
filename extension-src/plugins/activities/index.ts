// @ts-nocheck
// @tag:widget-activities
//
// Panel button that opens the GNOME Activities overview (the window picker /
// "expose" of open windows), like the top-left Activities button. It explicitly
// shows the window-picker state rather than the app grid.

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {buildButtonContent} from '../panelButtonContent.js';

const DEFAULTS = {icon: 'focus-windows-symbolic', text: ''};

export function create(parent, options) {
    const button = new St.Button({
        style_class: 'button ctlBtn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: buildButtonContent(options ?? {}, DEFAULTS),
    });
    button.connect('clicked', () => {
        // Main.overview.show() defaults to the WINDOW_PICKER state (the window
        // overview in the screenshot), unlike showApps() (the app grid).
        if (Main.overview.visible)
            Main.overview.hide();
        else
            Main.overview.show();
    });
    return button;
}
