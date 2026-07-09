// @ts-nocheck
// @tag:widget-gnome-action
//
// "Gnome Action" panel button (id `gnome-action`): a single click runs a
// configurable GNOME shell action. Formerly the `activities` widget; that id
// still resolves via a backward-compat alias in pluginManager, so existing user
// configs keep working. The default action is `overview`, which reproduces the
// historical Activities-button behaviour exactly.
//
// Actions:
//   - overview      Windows overview (tiled open windows + workspace thumbnails
//                   of the current workspace), like the top-left Activities
//                   button. This is the default.
//   - apps          All-applications grid (Main.overview.showApps()).
//   - show-desktop  Minimize every minimizable, non-minimized window.
//
// Every action is wrapped in try/catch: a click must never throw, and a throw
// in create() would disable the whole extension, so everything is guarded.

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {buildButtonContent} from '../panelButtonContent.js';

// Per-action fallback icon, used only when the user has not set options.icon.
// These are common Adwaita symbolic names.
const ACTION_ICONS = {
    'overview': 'focus-windows-symbolic',
    'apps': 'view-app-grid-symbolic',
    'show-desktop': 'user-desktop-symbolic',
};

const DEFAULT_ACTION = 'overview';

function runAction(action) {
    switch (action) {
        case 'apps':
            // All-applications grid. Keep it simple and reliable.
            Main.overview.showApps();
            break;
        case 'show-desktop':
            // Plain show-desktop: minimize every minimizable, non-minimized
            // window. Do not toggle/restore. Guard each window because API
            // shape (can_minimize/minimized) differs across builds.
            for (const actor of global.get_window_actors()) {
                try {
                    const w = actor?.meta_window;
                    if (!w)
                        continue;
                    if (typeof w.can_minimize === 'function' && !w.can_minimize())
                        continue;
                    if (w.minimized)
                        continue;
                    w.minimize();
                } catch (_error) {
                    // Ignore per-window failures; keep minimizing the rest.
                }
            }
            break;
        case 'overview':
        default:
            // Main.overview.show() defaults to the WINDOW_PICKER state (the
            // window overview), unlike showApps() (the app grid).
            if (Main.overview.visible)
                Main.overview.hide();
            else
                Main.overview.show();
            break;
    }
}

export function create(parent, options) {
    const opts = options ?? {};
    const action =
        typeof opts.action === 'string' && opts.action.length > 0
            ? opts.action
            : DEFAULT_ACTION;
    const defaults = {
        icon: ACTION_ICONS[action] ?? ACTION_ICONS[DEFAULT_ACTION],
        text: '',
    };

    const button = new St.Button({
        style_class: 'button ctlBtn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: buildButtonContent(opts, defaults),
    });
    button.connect('clicked', () => {
        try {
            runAction(action);
        } catch (_error) {
            // A click must never throw.
        }
    });
    return button;
}
