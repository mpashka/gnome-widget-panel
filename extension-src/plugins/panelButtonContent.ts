// @ts-nocheck
// @tag:mechanism
//
// Shared helper for the clickable panel-button widgets (gnome-menu, activities,
// favorites): builds the child actor showing an icon and/or a text label from
// `options.icon` / `options.text`, applying per-widget defaults.
//
// Rules: an unset option (not a string in `options`) falls back to the widget
// default; a value set to the empty string hides that element. If both the icon
// and the text would be hidden the default icon is shown so the button stays
// visible and clickable.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export function buildButtonContent(options, defaults) {
    const icon =
        typeof options.icon === 'string' ? options.icon : defaults.icon;
    const text =
        typeof options.text === 'string' ? options.text : defaults.text;

    let showIcon = Boolean(icon);
    const showText = Boolean(text);
    let iconName = icon;
    if (!showIcon && !showText) {
        // Both cleared: keep the button usable with the widget's default icon.
        showIcon = Boolean(defaults.icon);
        iconName = defaults.icon;
    }

    const box = new St.BoxLayout({
        style_class: 'panel-button-content',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (showIcon) {
        box.add_child(
            new St.Icon({
                icon_name: iconName,
                style_class: 'system-status-icon',
                y_align: Clutter.ActorAlign.CENTER,
            })
        );
    }
    if (showText) {
        box.add_child(
            new St.Label({
                text,
                y_align: Clutter.ActorAlign.CENTER,
            })
        );
    }
    return box;
}
