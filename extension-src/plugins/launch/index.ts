// @ts-nocheck
// @tag:widget-launch
//
// Panel button that launches a configured command line. Multi-instance: the
// same widget can be added several times, each with its own command, icon and
// label. It owns no menu and nothing to release beyond the button.

import GLib from 'gi://GLib';
import St from 'gi://St';

import {buildButtonContent} from '../panelButtonContent.js';

const DEFAULTS = {icon: 'application-x-executable-symbolic', text: ''};

export function create(parent, options) {
    const opts = options ?? {};
    const button = new St.Button({
        style_class: 'button ctlBtn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: buildButtonContent(opts, DEFAULTS),
    });
    button.connect('clicked', () => {
        const command =
            typeof opts.command === 'string' ? opts.command.trim() : '';
        if (!command)
            return;
        // Guarded: a bad command line must never propagate out of the click
        // handler and disable the panel.
        try {
            GLib.spawn_command_line_async(command);
        } catch (error) {
            logError(error, `launch: failed to run "${command}"`);
        }
    });
    return button;
}
