// @ts-nocheck
// @tag:widget-activities
//
// Panel button that toggles the GNOME Activities overview.

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
        Main.overview.toggle();
    });
    return button;
}
