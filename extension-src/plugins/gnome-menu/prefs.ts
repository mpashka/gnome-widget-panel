// @ts-nocheck
// @tag:widget-gnome-menu
//
// Per-widget settings UI for the gnome-menu widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` in
// widgets.json; the widget reads them on the next GNOME Shell reload.

import Adw from 'gi://Adw';

import {iconRow} from '../iconPicker.js';

const DEFAULT_ICON = 'view-app-grid-symbolic';

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Applications',
        icon_name: 'view-app-grid-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Button',
        description:
            'Shown as an icon and/or a text label. Leave the text empty for an '
            + 'icon-only button. Clearing both is not recommended: the button '
            + 'then falls back to its default icon.',
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

    const textRow = new Adw.EntryRow({
        title: 'Text',
        text: typeof current.text === 'string' ? current.text : '',
    });
    textRow.connect('changed', () => {
        current.text = textRow.get_text();
        commit();
    });
    group.add(textRow);
}
