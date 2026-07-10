// @ts-nocheck
// @tag:widget-caffeine
//
// Per-widget settings UI for the caffeine widget. Loaded lazily by the panel
// preferences UI (see ../../prefs.ts). Edits the widget `options` inside
// the `widgets` GSettings key; the running panel live-reloads on change.

import Adw from 'gi://Adw';

import {iconRow} from '../iconPicker.js';

const DEFAULT_ICON = 'preferences-desktop-screensaver-symbolic';

export function fillWidgetPreferences(context) {
    const {window, options, save} = context;
    const current = {...options};
    const commit = () => save({...current});

    const page = new Adw.PreferencesPage({
        title: 'Caffeine',
        icon_name: DEFAULT_ICON,
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Button',
        description:
            'Shown as an icon and/or a text label when inactive. Leave the text '
            + 'empty for an icon-only button. When active the button always shows '
            + 'its "awake" icon so the state is unmistakable; a custom text label '
            + 'stays visible in both states.',
    });
    page.add(group);

    group.add(iconRow({
        current,
        key: 'icon',
        fallback: DEFAULT_ICON,
        title: 'Icon',
        subtitle: 'Inactive-state icon, with a searchable picker.',
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

    const behaviorGroup = new Adw.PreferencesGroup({
        title: 'Behavior',
    });
    page.add(behaviorGroup);

    const inhibitSuspendRow = new Adw.SwitchRow({
        title: 'Inhibit suspend',
        subtitle: 'Also prevent automatic suspend while active',
        active: current.inhibitSuspend !== false,
    });
    inhibitSuspendRow.connect('notify::active', () => {
        current.inhibitSuspend = inhibitSuspendRow.active;
        commit();
    });
    behaviorGroup.add(inhibitSuspendRow);
}
