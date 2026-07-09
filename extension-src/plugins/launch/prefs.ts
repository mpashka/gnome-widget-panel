// @ts-nocheck
// @tag:widget-launch
//
// Per-widget settings UI for the launch widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` in
// widgets.json; the widget reads them on the next GNOME Shell reload.

import Adw from 'gi://Adw';

import {iconRow} from '../iconPicker.js';

const DEFAULT_ICON = 'application-x-executable-symbolic';

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Launch',
        icon_name: 'application-x-executable-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Button',
        description:
            'Runs the command when clicked (e.g. gnome-terminal -- htop). The '
            + 'icon and/or label identify the button; leave the label empty '
            + 'for an icon-only button.',
    });
    page.add(group);

    group.add(iconRow({
        current,
        key: 'icon',
        fallback: DEFAULT_ICON,
        title: 'Icon',
        subtitle: 'The selected icon, with a searchable picker.',
        commit,
    }));

    const commandRow = new Adw.EntryRow({
        title: 'Command',
        text: typeof current.command === 'string' ? current.command : '',
    });
    commandRow.connect('changed', () => {
        current.command = commandRow.get_text();
        commit();
    });
    group.add(commandRow);

    const labelRow = new Adw.EntryRow({
        title: 'Label',
        text: typeof current.text === 'string' ? current.text : '',
    });
    labelRow.connect('changed', () => {
        current.text = labelRow.get_text();
        commit();
    });
    group.add(labelRow);
}
