// @ts-nocheck
// @tag:widget-clock
//
// Per-widget settings UI for the clock widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';

const DEFAULT_FORMAT = '%H:%M';

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Clock',
        icon_name: 'preferences-system-time-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Time format',
        description:
            'Standard strftime/date template, e.g. %H:%M, '
            + '%a %d %b %H:%M:%S. Common specifiers: %H hour, %M minute, '
            + '%S second, %a weekday, %d day, %b month, %Y year.',
    });
    page.add(group);

    const row = new Adw.EntryRow({
        title: 'Format template',
        text:
            typeof current.format === 'string' && current.format
                ? current.format
                : DEFAULT_FORMAT,
    });
    row.connect('changed', () => {
        current.format = row.get_text();
        commit();
    });
    group.add(row);
}
