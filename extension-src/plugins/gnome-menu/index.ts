// @ts-nocheck
// @tag:widget-gnome-menu
//
// Panel button that opens the GNOME application grid (all applications).

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {buildButtonContent} from '../panelButtonContent.js';

const DEFAULTS = {icon: 'view-app-grid-symbolic', text: ''};

export function create(parent, options) {
    const button = new St.Button({
        style_class: 'button ctlBtn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: buildButtonContent(options ?? {}, DEFAULTS),
    });
    button.connect('clicked', () => {
        Main.overview.showApps();
    });
    return button;
}
